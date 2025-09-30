import lodash from 'lodash';
import { CFError } from '../Models/CFError';
import { Dictionary, GenDictionary } from '../Models/General';
import { DateUtil } from '../utils/date';
import z from 'zod';
import { logger } from '../utils/logger';
import { transformArray } from '../utils/transform';
import { netsuiteRequest, request } from '../utils/http';

// Temporary replacement for fuzzySearch utility - removed unused

interface FilterParam {
  Column: string;
  Operator: '<' | '<=' | '>' | '>=' | '=' | '!=' | 'Like' | 'Not_Like';
  Value: string;
}

interface OrderByParam {
  Column: string;
  SortOrder?: 'DESC' | 'ASC' | '';
}

interface NetSuiteParams {
  CountOnly?: boolean;
  OrderBy?: OrderByParam;
  Filters?: FilterParam[];
  Limit?: number;
  Offset?: number;
}

export type SuiteQLColumns = Dictionary<{
  sql: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  format?: string;
  filterOnly?: boolean;
}>;

export type SuiteScriptColumns = Dictionary<{
  name?: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'id' | 'enum';
  filtertype?: 'string' | 'number' | 'date' | 'boolean' | 'id';
  format?: string;
  filterOnly?: boolean;
  formula?: string;
  filterformula?: string;
  txt?: boolean;
  join?: string;
  summary?: string;
  enum?: string;
}>;

export class NetSuiteHelper {
  static readonly MAX_ARRAY_ITEMS = 10000;

  static paramSchema = {
    CountOnly: z
      .boolean()
      .optional()
      .describe(
        'If true, would return Count property only. If false, Count property is removed and array of results is returned. Default is false'
      ),
    OrderBy: z
      .object({
        Column: z.string().describe('Name of the output property to Sort on'),
        SortOrder: z.enum(['DESC', 'ASC']).default('ASC').describe('Order of the sorting'),
      })
      .optional()
      .describe('Sort the results by which output property. Use OrderBy as much as possible'),
    Filters: z
      .array(
        z.object({
          Column: z.string().describe('Name of the output property to filter on'),
          Operator: z
            .enum(['<', '<=', '>', '>=', '=', '!=', 'Like', 'Not_Like'])
            .describe('Operator of the filter'),
          Value: z.string().describe('Value of the filter.'),
        })
      )
      .optional()
      .describe('Filter the results by which output property. Use Filters as much as possible'),
    Limit: z
      .number()
      .max(10000)
      .optional()
      .describe('Limit the number of results. Max value is 10,000'),
  };

  static getOperator(reqtype: 'sql' | 'script', datatype: string, operator: string): string {
    logger.info({
      Module: 'NetSuiteHelper-getOperator',
      Message: 'Converting operator for request type and data type',
      ObjectMsg: {
        reqtype: reqtype,
        datatype: datatype,
        inputOperator: operator,
      },
    });

    let resultOperator: string;

    if (reqtype === 'sql') {
      if ((operator === '=' && datatype === 'string') || operator === 'Like')
        resultOperator = 'LIKE';
      else if ((operator === '!=' && datatype === 'string') || operator === 'Not_Like')
        resultOperator = 'NOT LIKE';
      else resultOperator = operator;
    } else {
      if (datatype === 'boolean') resultOperator = 'is';
      else if (datatype === 'number') {
        switch (operator) {
          case '=':
            resultOperator = 'EQUALTO';
            break;
          case '!=':
            resultOperator = 'NOTEQUALTO';
            break;
          case '<':
            resultOperator = 'LESSTHAN';
            break;
          case '<=':
            resultOperator = 'LESSTHANOREQUALTO';
            break;
          case '>':
            resultOperator = 'GREATERTHAN';
            break;
          case '>=':
            resultOperator = 'GREATERTHANOREQUALTO';
            break;
          default:
            throw new CFError(
              'AIErr',
              `Operator ${operator} for datetype ${datatype} not found for ${reqtype}`
            );
        }
      } else if (datatype === 'date') {
        switch (operator) {
          case '=':
            resultOperator = 'ON';
            break;
          case '!=':
            resultOperator = 'NOTON';
            break;
          case '<':
            resultOperator = 'BEFORE';
            break;
          case '<=':
            resultOperator = 'ONORBEFORE';
            break;
          case '>':
            resultOperator = 'AFTER';
            break;
          case '>=':
            resultOperator = 'ONORAFTER';
            break;
          default:
            throw new CFError(
              'AIErr',
              `Operator ${operator} for datetype ${datatype} not found for ${reqtype}`
            );
        }
      } else if (datatype === 'string') {
        switch (operator) {
          case '=':
          case 'Like':
            resultOperator = 'CONTAINS';
            break;
          case '!=':
          case 'Not_Like':
            resultOperator = 'DOESNOTCONTAIN';
            break;
          default:
            throw new CFError(
              'AIErr',
              `Operator ${operator} for datetype ${datatype} not found for ${reqtype}`
            );
        }
      } else if (datatype === 'id') {
        switch (operator) {
          case '=':
          case 'Like':
            resultOperator = 'ANYOF';
            break;
          case '!=':
          case 'Not_Like':
            resultOperator = 'NONEOF';
            break;
          default:
            throw new CFError(
              'AIErr',
              `Operator ${operator} for datetype ${datatype} not found for ${reqtype}`
            );
        }
      } else {
        throw new CFError(
          'AIErr',
          `Operator ${operator} for datetype ${datatype} not found for ${reqtype}`
        );
      }
    }

    logger.info({
      Module: 'NetSuiteHelper-getOperator',
      Message: 'Operator conversion completed',
      ObjectMsg: {
        reqtype: reqtype,
        datatype: datatype,
        inputOperator: operator,
        resultOperator: resultOperator,
      },
    });

    return resultOperator;
  }

  static getFiltersSQL(Columns: SuiteQLColumns, filtersParams: FilterParam[]): string {
    logger.info({
      Module: 'NetSuiteHelper-getFiltersSQL',
      Message: 'Starting SQL filter generation',
      ObjectMsg: {
        columnCount: Object.keys(Columns).length,
        filterCount: Array.isArray(filtersParams) ? filtersParams.length : 0,
        filters: filtersParams,
      },
    });

    let filters = '';
    let processedFilters = 0;
    let skippedFilters = 0;

    for (const filter of filtersParams) {
      // Check if the column exists in the Columns object
      if (!Columns[filter['Column']]) {
        logger.info({
          Module: 'NetSuiteHelper-getFiltersSQL',
          Message: 'Column not found in Columns object, skipping filter',
          ObjectMsg: {
            column: filter['Column'],
            availableColumns: Object.keys(Columns),
            filterDetails: filter,
          },
        });
        skippedFilters++;
        continue;
      }

      if (filters !== '') filters += ' AND ';

      const columnConfig = Columns[filter['Column']];
      const operator = this.getOperator('sql', columnConfig.type, filter['Operator']);

      filters += columnConfig.sql;
      filters += ` ${operator} `;

      let formattedValue: string;
      if (columnConfig.type === 'date') {
        const val = DateUtil.ISOToFormat(filter['Value'], 'yyyyMMdd');
        formattedValue = ` TO_DATE('${val}', 'YYYYMMDD') `;
      } else if (columnConfig.type === 'string') {
        formattedValue = ` '%${filter['Value']}%' `;
      } else {
        formattedValue = ` '${filter['Value']}' `;
      }

      filters += formattedValue;
      processedFilters++;

      logger.info({
        Module: 'NetSuiteHelper-getFiltersSQL',
        Message: 'Processed individual filter',
        ObjectMsg: {
          column: filter['Column'],
          operator: filter['Operator'],
          value: filter['Value'],
          sqlOperator: operator,
          columnType: columnConfig.type,
          formattedValue: formattedValue.trim(),
        },
      });
    }

    logger.info({
      Module: 'NetSuiteHelper-getFiltersSQL',
      Message: 'SQL filter generation completed',
      ObjectMsg: {
        processedFilters: processedFilters,
        skippedFilters: skippedFilters,
        finalFilterString: filters,
        filterStringLength: filters.length,
      },
    });

    return filters;
  }

  static formatSQL(
    sql: string,
    Columns: SuiteQLColumns,
    params: NetSuiteParams,
    inbuiltFilter: string,
    defaultSort: { Column: string; SortOrder: string }
  ): string {
    logger.info({
      Module: 'NetSuiteHelper-formatSQL',
      Message: 'Starting SQL formatting',
      ObjectMsg: {
        baseSql: sql,
        columnCount: Object.keys(Columns).length,
        params: params,
        inbuiltFilter: inbuiltFilter,
        defaultSort: defaultSort,
      },
    });

    const startTime = Date.now();

    const columns = Object.keys(Columns)
      .map((key: string) =>
        Columns[key].filterOnly !== true ? `${Columns[key].sql} AS ${key}` : ''
      )
      .filter((k) => k !== '')
      .join(', ');

    logger.info({
      Module: 'NetSuiteHelper-formatSQL',
      Message: 'Generated column selection',
      ObjectMsg: {
        columnsGenerated: columns,
        filteredOutCount: Object.keys(Columns).length - columns.split(',').length,
        isCountOnly: params.CountOnly === true,
      },
    });

    const limit = params.CountOnly === true ? '' : params.Limit ? 'TOP ' + params.Limit : '';

    sql = sql.replace(
      '{Columns}',
      params.CountOnly === true ? 'COUNT(*) AS Count' : `${limit} ${columns}`
    );

    const OrderBy =
      params.CountOnly === true
        ? ''
        : params.OrderBy && Columns[params.OrderBy.Column]
        ? Columns[params.OrderBy.Column].sql + ' ' + params.OrderBy.SortOrder
        : Columns[defaultSort.Column]
        ? Columns[defaultSort.Column].sql + ' ' + defaultSort.SortOrder
        : '';

    logger.info({
      Module: 'NetSuiteHelper-formatSQL',
      Message: 'Generated ORDER BY clause',
      ObjectMsg: {
        hasCustomOrderBy: !!(params.OrderBy && Columns[params.OrderBy.Column]),
        customOrderBy: params.OrderBy,
        defaultSort: defaultSort,
        finalOrderBy: OrderBy,
      },
    });

    sql = sql.replace('{OrderBy}', OrderBy !== '' ? 'ORDER BY ' + OrderBy : '');

    const filterString = params.Filters ? this.getFiltersSQL(Columns, params.Filters) : '';
    let filters = '';
    if (inbuiltFilter !== '') filters += ' ' + inbuiltFilter;
    if (filterString !== '') filters += (filters !== '' ? ' AND ' : '') + filterString;

    logger.info({
      Module: 'NetSuiteHelper-formatSQL',
      Message: 'Generated WHERE clause',
      ObjectMsg: {
        hasInbuiltFilter: inbuiltFilter !== '',
        hasCustomFilters: filterString !== '',
        inbuiltFilter: inbuiltFilter,
        customFilters: filterString,
        combinedFilters: filters,
      },
    });

    sql = sql.replace('{Filters}', filters !== '' ? 'WHERE ' + filters : '');

    const processingTime = Date.now() - startTime;

    logger.info({
      Module: 'NetSuiteHelper-formatSQL',
      Message: 'SQL formatting completed',
      ObjectMsg: {
        finalSql: sql,
        sqlLength: sql.length,
        processingTime: processingTime,
        hasLimit: !!limit,
        hasOrderBy: OrderBy !== '',
        hasFilters: filters !== '',
      },
    });

    return sql;
  }

  private static errorfn(msg: string, type: 'UserErr' | 'AIErr' = 'UserErr'): never {
    const errorMessage = msg;

    logger.error({
      Module: 'NetSuiteHelper-error',
      Message: 'Error function called',
      ObjectMsg: {
        originalMessage: msg,
        errorType: type,
        finalMessage: errorMessage,
        stack: new Error().stack,
      },
    });

    throw new CFError(type, errorMessage);
  }

  static error(msg: string, type?: 'UserErr' | 'AIErr'): never {
    logger.info({
      Module: 'NetSuiteHelper-error',
      Message: 'Public error method called',
      ObjectMsg: {
        message: msg,
        type: type || 'UserErr',
      },
    });

    return this.errorfn(msg, type);
  }

  // SuiteQL helper function - executes SuiteQL queries with automatic authentication
  static async executeSuiteQL(
    query: string,
    offset?: number
  ): Promise<{
    totalCount: number;
    items: Record<string, unknown>[];
    hasMore: boolean;
    offset: number;
    count: number;
  }> {
    const executionStartTime = Date.now();
    logger.info({
      Module: 'NetSuiteHelper-executeSuiteQL',
      Message: 'Starting SuiteQL execution',
      ObjectMsg: {
        queryLength: query.length,
        offset: offset || 0,
        startTime: new Date(executionStartTime).toISOString(),
        queryPreview: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      },
    });

    try {
      const path = 'query/v1/suiteql';

      const requestData = { q: query };
      const requestParams = { offset: offset || 0 };
      const requestHeaders = { Prefer: 'transient' };

      logger.info({
        Module: 'NetSuiteHelper-executeSuiteQL',
        Message: 'Making SuiteQL request',
        ObjectMsg: {
          path: path,
          requestDataSize: JSON.stringify(requestData).length,
          requestParams: requestParams,
          requestHeaders: requestHeaders,
        },
      });

      const requestStartTime = Date.now();
      const data = (await netsuiteRequest(
        path,
        'POST',
        requestData,
        requestParams,
        requestHeaders
      )) as {
        totalResults?: number;
        items?: Record<string, unknown>[];
        hasMore?: boolean;
        offset?: number;
        count?: number;
      };
      const requestDuration = Date.now() - requestStartTime;

      const result = {
        totalCount: data.totalResults || 0,
        items: data.items || [],
        hasMore: data.hasMore || false,
        offset: data.offset || 0,
        count: data.count || 0,
      };

      const totalDuration = Date.now() - executionStartTime;

      logger.info({
        Module: 'NetSuiteHelper-executeSuiteQL',
        Message: 'SuiteQL execution completed successfully',
        ObjectMsg: {
          totalCount: result.totalCount,
          itemsReturned: result.items.length,
          hasMore: result.hasMore,
          offset: result.offset,
          count: result.count,
          requestDuration: requestDuration,
          totalDuration: totalDuration,
          avgItemProcessingTime:
            result.items.length > 0 ? requestDuration / result.items.length : 0,
        },
      });

      return result;
    } catch (error) {
      const totalDuration = Date.now() - executionStartTime;
      logger.error({
        Module: 'NetSuiteHelper-executeSuiteQL',
        Message: 'SuiteQL execution failed',
        ObjectMsg: {
          error: error instanceof Error ? error.message : 'Unknown error',

          queryLength: query.length,
          offset: offset || 0,
          totalDuration: totalDuration,
          queryPreview: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
        },
      });

      this.error(
        `Failed to execute query: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'AIErr'
      );

      // Return default structure if error doesn't throw
      return {
        totalCount: 0,
        items: [],
        hasMore: false,
        offset: 0,
        count: 0,
      };
    }
  }

  static getFiltersSearch(
    Columns: SuiteScriptColumns,
    filtersParams: FilterParam[]
  ): Array<string | string[]> {
    const filters: Array<string | string[]> = [];
    for (const filter of filtersParams) {
      if (filters.length !== 0) filters.push('AND');

      const colName = Columns[filter.Column].filterformula
        ? Columns[filter.Column].filterformula!
        : Columns[filter.Column].formula
        ? Columns[filter.Column].formula!
        : Columns[filter.Column].join
        ? `${Columns[filter.Column].join}.${Columns[filter.Column].name}`
        : Columns[filter.Column].name!;
      const operator = this.getOperator(
        'script',
        Columns[filter.Column].filtertype ?? Columns[filter.Column].type,
        filter.Operator
      );
      let value = filter.Value;
      if (Columns[filter.Column].type === 'date') {
        value = DateUtil.ISOToFormat(filter.Value, Columns[filter.Column].format ?? 'M/d/yyyy');
      }

      filters.push([colName, operator, value]);
    }
    return filters;
  }

  static formatSearchObj(
    type: string,
    Columns: SuiteScriptColumns,
    params: NetSuiteParams,
    inbuiltFilter: Array<string | string[]>,
    defaultSort: { Column: string; SortOrder: string },
    settings?: Dictionary<string>
  ): {
    type: string;
    filters: Array<string | string[]>;
    columns: GenDictionary[];
    countOnly: boolean;
    maxResults: number;
    settings: Array<{ name: string; value: string }>;
  } {
    const settingsCopy = settings
      ? Object.keys(settings).map((key) => {
          return { name: key, value: settings[key] };
        })
      : [];

    const searchRestletParams = {
      type: type,
      filters: [] as Array<string | string[]>,
      columns: [] as GenDictionary[],
      countOnly: false,
      maxResults: 0,
      settings: settingsCopy,
    };
    const OrderBy =
      params.CountOnly === true
        ? ['', '']
        : params.OrderBy
        ? [params.OrderBy.Column, params.OrderBy.SortOrder || 'ASC']
        : [defaultSort.Column, defaultSort.SortOrder];

    searchRestletParams.columns = Object.keys(Columns)
      .map((key: string) => {
        if (Columns[key].filterOnly === true) return {};
        const col: GenDictionary = {
          name: Columns[key].formula
            ? Columns[key].formula?.split(':')[0].trim()
            : Columns[key].name,
          txt: Columns[key].txt,
          join: Columns[key].join,
          summary: Columns[key].summary,
          formula: Columns[key].formula ? Columns[key].formula?.split(':')[1].trim() : undefined,
        };
        if (key === OrderBy[0]) col['sort'] = OrderBy[1];
        return col;
      })
      .filter((i) => !lodash.isEmpty(i));

    const limit = params.CountOnly === true ? 1 : params.Limit || 0;
    searchRestletParams.maxResults = limit;

    const filters = params.Filters ? this.getFiltersSearch(Columns, params.Filters) : [];

    searchRestletParams.filters = inbuiltFilter ? [...inbuiltFilter] : [];
    if (searchRestletParams.filters.length > 0 && filters.length > 0)
      searchRestletParams.filters.push('AND');
    filters.forEach((fi: string | string[]) => {
      searchRestletParams.filters.push(fi);
    });

    return searchRestletParams;
  }

  static async searchRestlet(
    type: string,
    columns: SuiteScriptColumns,
    params: NetSuiteParams,
    inbuiltFilter: Array<string | Array<string>>,
    defaultSort: { Column: string; SortOrder: string },
    settings?: Dictionary<string>
  ): Promise<{ count?: number; items?: Record<string, unknown>[] } | { Count: number }> {
    const executionStartTime = Date.now();

    logger.info({
      Module: 'NetSuiteHelper-searchRestlet',
      Message: 'Starting search restlet execution',
      ObjectMsg: {
        type: type,
        columnCount: Object.keys(columns).length,
        params: params,
        inbuiltFilterCount: inbuiltFilter.length,
        defaultSort: defaultSort,
        startTime: new Date(executionStartTime).toISOString(),
      },
    });

    const searchRestletParams = NetSuiteHelper.formatSearchObj(
      type,
      columns,
      params,
      inbuiltFilter,
      defaultSort,
      settings
    );

    // Set default values and validate maxResults
    searchRestletParams.countOnly = searchRestletParams.countOnly || false;
    searchRestletParams.maxResults = searchRestletParams.maxResults || this.MAX_ARRAY_ITEMS;

    if (searchRestletParams.maxResults > this.MAX_ARRAY_ITEMS) {
      this.error(`Cannot fetch more than ${this.MAX_ARRAY_ITEMS} in a single request`);
    }

    logger.info({
      Module: 'NetSuite-Helper-SearchRestlet',
      Message: 'Making search restlet request',
      ObjectMsg: searchRestletParams,
    });

    try {
      const searchRestletUrl = process.env.NETSUITE_SEARCH_REST_LET;

      if (!searchRestletUrl) {
        this.error('NETSUITE_SEARCH_REST_LET environment variable not configured', 'AIErr');
      }

      const authToken = process.env.NETSUITE_ACCESS_TOKEN;
      if (!authToken) {
        this.error('NETSUITE_ACCESS_TOKEN environment variable not configured', 'AIErr');
      }

      const requestStartTime = Date.now();
      const resp = await request<{
        success?: boolean;
        error?: unknown;
        data?: { count: number; items: Record<string, unknown>[] };
      }>({
        method: 'POST',
        url: searchRestletUrl!,
        data: searchRestletParams,
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      const requestDuration = Date.now() - requestStartTime;

      if (resp.success === false) {
        throw new CFError('APIErr', JSON.stringify(resp.error));
      }

      const result = {
        count: resp.data?.count || 0,
        items: resp.data?.items || [],
      };

      if (params.CountOnly === true) {
        const countResult = { Count: result.count };

        logger.info({
          Module: 'NetSuiteHelper-searchRestlet',
          Message: 'Search restlet count-only execution completed',
          ObjectMsg: {
            count: result.count,
            requestDuration: requestDuration,
            totalDuration: Date.now() - executionStartTime,
          },
        });

        return countResult;
      }

      // Transform the columns to the format expected by the transformArray function
      const transformColumns: Dictionary<{
        type: 'string' | 'number' | 'date' | 'boolean' | 'id';
        format?: string;
      }> = {};

      Object.keys(columns).forEach((key) => {
        if (columns[key].filterOnly !== true) {
          transformColumns[key] = {
            type: columns[key].type === 'enum' ? 'string' : columns[key].type,
            format: columns[key].format,
          };
        }
      });

      const output = transformArray(result.items as unknown as unknown[][], transformColumns);

      logger.info({
        Module: 'NetSuiteHelper-searchRestlet',
        Message: 'Transform debug info',
        ObjectMsg: {
          transformColumns: transformColumns,
          rawItemsSample: result.items.slice(0, 2),
          transformedSample: output.slice(0, 2),
        },
      });
      const totalDuration = Date.now() - executionStartTime;

      logger.info({
        Module: 'NetSuiteHelper-searchRestlet',
        Message: 'Search restlet execution completed successfully',
        ObjectMsg: {
          itemsReturned: result.items.length,
          transformedItemsCount: output.length,
          requestDuration: requestDuration,
          totalDuration: totalDuration,
          avgItemProcessingTime:
            result.items.length > 0 ? requestDuration / result.items.length : 0,
        },
      });

      return { items: output };
    } catch (error) {
      const totalDuration = Date.now() - executionStartTime;

      logger.error({
        Module: 'NetSuiteHelper-searchRestlet',
        Message: 'Search restlet execution failed',
        ObjectMsg: {
          error: error instanceof Error ? error.message : 'Unknown error',

          type: type,
          params: params,
          totalDuration: totalDuration,
        },
      });

      if (error instanceof CFError) {
        throw error;
      }

      this.error(
        `Failed to execute search: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'AIErr'
      );

      // This will never be reached due to the error throwing above, but included for type safety
      return { count: 0, items: [] };
    }
  }

  static validateParamFilters(
    params: NetSuiteParams,
    check: Partial<{ period: boolean; date: boolean }>
  ): void {
    const checkDefault = { period: true, date: true };
    check = lodash.merge(checkDefault, check);
    if (!params.Filters || !Array.isArray(params.Filters) || params.Filters.length === 0)
      this.error('Filters cannot be empty', 'AIErr');

    if (check.period === true) {
      const periodFilter = params.Filters?.find((fil: FilterParam) => fil.Column === 'Period');
      if (periodFilter) this.error('Period cannot be used as filter, use Date column', 'AIErr');
    }

    if (check.date === true) {
      const dateFilter = params.Filters?.find(
        (fil: FilterParam) => fil.Column === 'Date' || fil.Column === 'DueDate'
      );
      if (!dateFilter)
        this.error('Date filter is required, as data is too much otherwise', 'AIErr');
    }
  }
}

import { NetSuiteHelper } from '../helper';
import { transformArray, transform } from '../../utils/transform';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import { DateUtil } from '../../utils/date';
import { request } from '../../utils/http';
import lodash from 'lodash';
import { fuzzySearch } from '../../utils/fuzzySearch';
import { GenDictionary } from '../../Models/General';
import zodToJsonSchema from 'zod-to-json-schema';

interface GetAccountBalanceInput {
  AccountNumbers: string[];
  StartDate?: string;
  EndDate?: string;
  Subsidiary?: string;
  IsSubConsolidated?: boolean;
}

interface AccountData {
  Id: number;
  AccountNumber: string;
  Name: string;
  ParentNumber?: string;
}

interface BalanceData {
  Id: number;
  Balance: number;
}

export class GetAccountBalance {
  private readonly toolName = 'get-account-balance';

  private readonly Columns = {
    Id: { sql: 's.Id', type: 'number' as const },
    Name: { sql: 's.Name', type: 'string' as const },
    ParentId: { sql: 's.parent', type: 'number' as const },
  };

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: 'Get Account Balance',
        description:
          'Get Balance of Accounts based on Input Parameters. When retrieving balances for all accounts, do NOT invoke this function separately for each account. Instead, call this function **once** by passing all account numbers together as an array.' +
          `Output Schema of this tool: ${JSON.stringify(
            zodToJsonSchema(
              z.object({
                balances: z
                  .array(
                    z.object({
                      AccountNumber: z.string().describe('Number of the Account'),
                      Name: z.string().optional().describe('Name of the Account'),
                      Balance: z.number().optional().describe('Account Balance'),
                    })
                  )
                  .describe('Array of account balance records.'),
              })
            )
          )}`,
        inputSchema: {
          AccountNumbers: z
            .array(z.string())
            .describe('Array of Account Numbers to get the balance'),
          StartDate: z
            .string()
            .optional()
            .describe(
              'Start Date for calculating Balance. This is always first of the Month. Default is this Month'
            ),
          EndDate: z
            .string()
            .optional()
            .describe(
              'End Date for calculating Balance. This is always End of the Month. Default is this Month'
            ),
          Subsidiary: z
            .string()
            .optional()
            .describe(
              'Subsidiary name to be filtered. Remove consolidated from the name if it exists'
            ),
          IsSubConsolidated: z
            .boolean()
            .optional()
            .describe(
              'Is Subsidiary consolidated filter, this is considered based on Consolidated word in the Subsidiary Name filter. Default is false'
            ),
        },
      },
      async (input: GetAccountBalanceInput) => {
        const startTime = Date.now();

        logger.error({
          Module: 'getAccountBalance',
          Message: 'Received input for getAccountBalance',
          ObjectMsg: { input },
        });

        try {
          if (
            !Array.isArray(input.AccountNumbers) ||
            input.AccountNumbers.filter(Boolean).length === 0
          ) {
            throw new Error('Accounts cannot be Empty');
          }

          const accNumbers = input.AccountNumbers.filter(Boolean).map((acc) => acc.toString());

          // Get all accounts data
          const accountsData = await this.getAccountsData();

          logger.info({
            Module: 'getAccountBalance',
            Message: 'Fetched all accounts data',
            ObjectMsg: { totalAccounts: accountsData.length },
          });

          // Get child accounts for each requested account
          const childAccounts: Map<string, number[]> = new Map();
          accNumbers.forEach((Numb) => {
            childAccounts.set(Numb, this.getChildrenByNumber(accountsData, Numb));
          });
          const totalAccountIds: number[] = lodash.uniq(Array.from(childAccounts.values()).flat());

          if (totalAccountIds.length === 0) {
            logger.error({
              Module: 'getAccountBalance',
              Message: 'No matching accounts found for the provided AccountNumbers',
              ObjectMsg: { input },
            });

            throw new Error('Accounts not found');
          }

          // Get subsidiary filter if provided
          const subsidiaryIds = await this.getSubsidiaryFilter(
            input.Subsidiary,
            input.IsSubConsolidated
          );

          // Get search restlet parameters for account balance
          const searchFilter = this.getAccountSearchFilter(
            totalAccountIds,
            input.StartDate,
            input.EndDate,
            subsidiaryIds
          );

          // Execute search restlet using the helper's searchRestlet but with direct parameter passing
          const searchRestletUrl = process.env.NETSUITE_SEARCH_REST_LET;
          if (!searchRestletUrl) {
            throw new Error('NETSUITE_SEARCH_REST_LET environment variable not configured');
          }

          const authToken = process.env.NETSUITE_ACCESS_TOKEN;
          if (!authToken) {
            throw new Error('NETSUITE_ACCESS_TOKEN environment variable not configured');
          }

          const resp = await request<{
            success?: boolean;
            error?: unknown;
            data?: { count: number; items: unknown[][] };
          }>({
            method: 'POST',
            url: searchRestletUrl,
            data: searchFilter,
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
          });

          if (resp.success === false) {
            throw new Error(JSON.stringify(resp.error));
          }

          const rawItems = resp.data?.items || [];

          const balanceData = transformArray(rawItems as unknown as unknown[][], {
            Id: { type: 'number' },
            Balance: { type: 'number' },
          }) as unknown as BalanceData[];

          // Calculate balance for each requested account
          const outputData = accNumbers.map((parent) => {
            const children = childAccounts.get(parent);
            const sum = this.calculateBalanceSum(balanceData, children ?? []);
            return {
              AccountNumber: parent,
              Name: accountsData.find((node: AccountData) => node.AccountNumber === parent)?.Name,
              Balance: Number(sum.toFixed(2)),
            };
          });

          const totalDuration = Date.now() - startTime;

          logger.info({
            Module: 'getAccountBalance',
            Message: 'Successfully retrieved account balances',
            ObjectMsg: {
              accountsProcessed: accNumbers.length,
              totalAccountIds: totalAccountIds.length,
              executionTime: totalDuration,
            },
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(outputData, null, 2),
              },
            ],
            structuredContent: { balances: outputData },
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: 'getAccountBalance',
            Message: 'Error occurred during getAccountBalance execution',
            ObjectMsg: {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              input: input,
              executionTime: totalDuration,
            },
          });

          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: errorMessage,
                    message: error instanceof Error ? error.message : String(error),
                    timestamp: new Date().toISOString(),
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  private async getAccountsData(): Promise<AccountData[]> {
    // Use SuiteQL just like GetAccounts tool does
    const sql = `SELECT {Columns} FROM Account a`;

    const Columns = {
      Id: { sql: 'a.Id', type: 'number' as const },
      Name: { sql: 'a.accountSearchDisplayNameCopy', type: 'string' as const },
      AccountNumber: { sql: 'a.acctNumber', type: 'string' as const },
      ParentId: { sql: 'a.parent', type: 'number' as const },
    };

    const formattedSQL = NetSuiteHelper.formatSQL(sql, Columns, {}, '', {
      Column: 'Name',
      SortOrder: 'Asc',
    });

    logger.info({
      Module: 'getAccountBalance',
      Message: 'Fetching all accounts data using SuiteQL',
      ObjectMsg: { formattedSQL },
    });

    // Get all accounts data using SuiteQL with pagination
    let totalData: Record<string, unknown>[] = [];
    let continueLoop = true;
    let dataOffset = 0;

    while (continueLoop) {
      if (dataOffset > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const data = await NetSuiteHelper.executeSuiteQL(formattedSQL, dataOffset);

      logger.info({
        Module: 'getAccountBalance',
        Message: 'Fetched accounts data batch',
        ObjectMsg: { offset: dataOffset, count: data.count, hasMore: data.hasMore },
      });

      const output = transform(data.items, Columns);
      totalData.push(...output);

      if (data.hasMore) {
        dataOffset = data.offset + data.count;
      } else {
        continueLoop = false;
      }
    }

    // Update parent numbers from IDs (same logic as GetAccounts)
    const processedData = this.updateParentNumberFromId(totalData);

    return processedData as unknown as AccountData[];
  }

  private updateParentNumberFromId(data: Record<string, unknown>[]): Record<string, unknown>[] {
    // Convert the array to a map for direct access by Id
    const idToItemMap = new Map(data.map((item) => [item.Id, item]));

    // Iterate over the array and add "Parent Number"
    data.forEach((item) => {
      if (item.ParentId) {
        const parentItem = idToItemMap.get(item.ParentId);
        if (parentItem && typeof parentItem === 'object' && parentItem !== null) {
          const parentObj = parentItem as Record<string, unknown>;
          item.ParentNumber = parentObj.AccountNumber;
        }
        delete item.ParentId;
      }
    });

    return data;
  }

  private calculateBalanceSum(balanceData: BalanceData[], children: number[]): number {
    return children.reduce((sum, childId) => {
      const obj = balanceData.find((b) => b.Id === childId);
      return sum + (obj ? obj.Balance : 0);
    }, 0);
  }

  private getChildrenByNumber(accountData: AccountData[], Numb: string): number[] {
    const result: number[] = [];

    function findRecursively(currentNumb: string): void {
      const children = accountData
        .filter((node) => node.ParentNumber !== undefined && node.ParentNumber === currentNumb)
        .map((d) => d.Id);
      result.push(...children);

      logger.info({
        Module: 'getAccountBalance-findRecursively',
        Message: `Finding children for account number: ${Numb}`,
        ObjectMsg: { currentNumb, childrenFound: children.length },
      });

      children.forEach((child) => {
        findRecursively(child.toString());
      });
    }

    logger.info({
      Module: 'getAccountBalance',
      Message: `Finding children for account number: ${Numb}`,
    });

    const selfAcc = accountData.find((node) => node.AccountNumber === Numb);
    if (selfAcc) result.push(selfAcc.Id);
    findRecursively(Numb);
    return result;
  }

  private getAccountSearchFilter(
    accountIds: number[],
    startDate?: string,
    endDate?: string,
    subsidiaryIds?: number[]
  ): Record<string, unknown> {
    const dateFormat = 'M/d/yyyy';

    // Use current month if dates not provided
    const defaultStartDate = DateUtil.getStartOf(startDate, 'month');
    const defaultEndDate = DateUtil.getEndOf(endDate, 'month');

    const formatStartDate = DateUtil.ISOToFormat(defaultStartDate, dateFormat);
    const formatEndDate = DateUtil.ISOToFormat(defaultEndDate, dateFormat);

    const searchObj = {
      type: 'transaction',
      filters: [
        [
          [
            ['accounttype', 'anyof', 'COGS', 'Expense', 'Income', 'OthIncome', 'OthExpense'],
            'AND',
            ['accountingperiod.startdate', 'onorafter', formatStartDate],
            'AND',
            ['accountingperiod.enddate', 'onorbefore', formatEndDate],
          ],
          'OR',
          [
            ['accounttype', 'noneof', 'Income', 'COGS', 'Expense', 'OthIncome', 'OthExpense'],
            'AND',
            ['accountingperiod.enddate', 'onorbefore', formatEndDate],
          ],
        ],
        'AND',
        ['posting', 'is', 'T'],
        'AND',
        ['account', 'anyof', ...accountIds.map((id) => id.toString())],
      ],
      columns: [
        {
          name: 'internalid',
          join: 'account',
          summary: 'GROUP',
          txt: true,
        },
        {
          name: 'amount',
          summary: 'SUM',
        },
      ],
    };

    if (subsidiaryIds && subsidiaryIds.length > 0) {
      searchObj.filters.push('AND', [
        'subsidiary',
        'anyof',
        ...subsidiaryIds.map((id) => id.toString()),
      ]);
    }

    return searchObj;
  }

  private async getSubsidiaryFilter(
    subsidiary?: string,
    IsSubConsolidated?: boolean
  ): Promise<number[]> {
    if (!subsidiary || String(subsidiary).trim() === '') return [];

    const result = await NetSuiteHelper.searchRestlet('subsidiary', this.Columns, {}, [], {
      Column: 'Id',
      SortOrder: 'ASC',
    });

    logger.info({
      Module: 'getAccountBalance',
      Message: 'Fetched all subsidiaries data for filtering',
      ObjectMsg: {
        subsidiary,
        IsSubConsolidated,
        subsidiariesCount: (result as { items?: Record<string, unknown>[] }).items?.length ?? 0,
      },
    });

    // Handle items response
    const itemsResult = result as { items?: Record<string, unknown>[] };
    let subsidiaries = itemsResult.items || [];

    const consolidatedSubs = subsidiaries.filter((sub) =>
      subsidiaries.some((item) => item.ParentId === sub.Id)
    );

    logger.info({
      Module: 'getAccountBalance',
      Message: `Finding subsidiaries matching: ${subsidiary} with IsSubConsolidated=${IsSubConsolidated}`,
      ObjectMsg: { consolidatedCount: consolidatedSubs.length },
    });

    let fuzzyResult = fuzzySearch(
      IsSubConsolidated === true ? consolidatedSubs : subsidiaries,
      subsidiary,
      'Name',
      true
    );
    // If Consolidated Subsidiary, but no fuzzy match. Search for general Subsidiaries
    if (fuzzyResult.length === 0 && IsSubConsolidated === true)
      fuzzyResult = fuzzySearch(subsidiaries, subsidiary, 'Name', true);

    if (fuzzyResult.length > 5) {
      throw new Error(
        `${fuzzyResult.length} subsidiaries matched your request. Please give more specifics.`
      );
    }
    if (fuzzyResult.length > 1) {
      const subs: string = fuzzyResult.map((f) => `"${f.Name}"`).join(', ');
      throw new Error(
        `${fuzzyResult.length} Subsidiaries ${subs} match your request, which subsidiary data are you looking for`
      );
    }
    if (fuzzyResult.length === 0) throw new Error(`No Subsidiaries match your request`);

    const filterByParent = (subs: GenDictionary[], parentid: number | undefined): number[] =>
      subs
        .filter((sub: GenDictionary) => sub.ParentId === parentid)
        .map((sub: GenDictionary) => sub.Id as number);

    const getChildren = (subs: GenDictionary[], parentid: number): number[] => {
      const children = filterByParent(subs, parentid);
      for (const child of children) {
        const grandchildren = getChildren(subs, child);
        children.push(...grandchildren);
      }
      return children;
    };

    const selectedSubs: number[] =
      IsSubConsolidated === true ? getChildren(subsidiaries, fuzzyResult[0].Id as number) : [];
    selectedSubs.push(fuzzyResult[0].Id as number);
    return selectedSubs;
  }
}

import { NetSuiteHelper, SuiteScriptColumns } from '../helper';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../../utils/logger';

interface GetJournalsInput {
  CountOnly?: boolean;
  OrderBy?: {
    Column: string;
    SortOrder?: 'DESC' | 'ASC' | '';
  };
  Filters?: Array<{
    Column: string;
    Operator: '<' | '<=' | '>' | '>=' | '=' | '!=' | 'Like' | 'Not_Like';
    Value: string;
  }>;
  Limit?: number;
  Offset?: number;
}

export class GetJournals {
  private readonly toolName = 'get-journals';

  private readonly Columns: SuiteScriptColumns = {
    Id: { name: 'internalid', type: 'id' },
    Date: { name: 'trandate', type: 'date', format: 'M/d/yyyy' },
    Period: { name: 'postingperiod', type: 'string', txt: true },
    Name: {
      name: 'entity',
      type: 'string',
      filterformula: 'formulatext: {entity}',
    },
    DocumentNumber: { name: 'tranid', type: 'string' },
    Memo: { name: 'memo', type: 'string' },
    Account: {
      name: 'account',
      type: 'string',
      txt: true,
      filterformula: 'formulatext: {account.number}',
    },
    Subsidiary: {
      name: 'subsidiary',
      type: 'string',
      txt: true,
      filterformula: 'formulatext: {subsidiary}',
    },
    Amount: { name: 'amount', type: 'number' },
    Status: {
      name: 'status',
      type: 'string',
      txt: true,
      filterformula: 'formulatext: {status}',
    },
  };

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: 'Get Journals',
        description: 'Get List of Journal Entries',
        inputSchema: NetSuiteHelper.paramSchema,
        outputSchema: {
          journals: z
            .array(
              z.object({
                Id: z.string().optional().describe('Id of the Journal'),
                Date: z.string().optional().describe('Date of the Journal'),
                Period: z
                  .string()
                  .optional()
                  .describe(
                    'Period of the Journal. Do not use Period for filter, use Date column.'
                  ),
                Name: z.string().optional().describe('Name associated with the Journal'),
                DocumentNumber: z.string().optional().describe('Document Number of the Journal'),
                Memo: z.string().optional().describe('Memo of the Journal'),
                Account: z
                  .string()
                  .optional()
                  .describe(
                    'In output, Account is the Name of the Account associated with this Journal. For Filter, this is the AccountNumber'
                  ),
                Subsidiary: z.string().optional().describe('Subsidiary associated with Journal'),
                Amount: z.number().optional().describe('Amount of the Journal'),
                Status: z
                  .enum(['Approved for Posting', 'Pending Approval', 'Rejected'])
                  .optional()
                  .describe('Status of the Journal'),
              })
            )
            .describe(
              'Array of journal records. Present when CountOnly=false. Each journal represents journal entry data.'
            )
            .optional(),
          Count: z
            .number()
            .int()
            .positive()
            .describe('Total number of journal records. Present when CountOnly=true.')
            .optional(),
        },
      },
      async (input: GetJournalsInput) => {
        const startTime = Date.now();

        try {
          NetSuiteHelper.validateParamFilters(input, {});
          // Use the searchRestlet helper method with specific filters for journals
          const filters = [['type', 'anyof', 'Journal']];

          const result = await NetSuiteHelper.searchRestlet(
            'transaction',
            this.Columns,
            input,
            filters,
            {
              Column: 'Date',
              SortOrder: 'DESC',
            }
          );

          // Handle count-only response
          if (input.CountOnly === true) {
            const countResult = result as { Count: number };

            logger.info({
              Module: 'getJournals',
              Message: 'Successfully retrieved journals count',
              ObjectMsg: {
                count: countResult.Count,
                executionTime: Date.now() - startTime,
              },
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(countResult, null, 2),
                },
              ],
              structuredContent: countResult,
            };
          }

          // Handle items response
          const itemsResult = result as { items?: Record<string, unknown>[] };
          const journals = itemsResult.items || [];

          // Convert Id fields to strings and ensure proper typing
          const finalData = journals.map((journal) => ({
            ...journal,
            Id: journal.Id !== undefined ? String(journal.Id) : undefined,
            Amount:
              typeof journal.Amount === 'string' ? parseFloat(journal.Amount) : journal.Amount,
          }));

          const totalDuration = Date.now() - startTime;

          logger.info({
            Module: 'getJournals',
            Message: 'Successfully retrieved journals',
            ObjectMsg: {
              itemsReturned: finalData.length,
              executionTime: totalDuration,
            },
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(finalData, null, 2),
              },
            ],
            structuredContent: { journals: finalData },
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: 'getJournals',
            Message: 'Error occurred during getJournals execution',
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
                    message: 'Failed to get journals from NetSuite',
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
}

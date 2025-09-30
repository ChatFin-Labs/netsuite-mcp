import { NetSuiteHelper, SuiteScriptColumns } from '../helper';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import zodToJsonSchema from 'zod-to-json-schema';

interface GetTransactionsInput {
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

export class GetTransactions {
  private readonly toolName = 'get-transactions';

  private readonly Columns: SuiteScriptColumns = {
    Id: { name: 'internalid', type: 'id' },
    Date: { name: 'trandate', type: 'date', format: 'M/d/yyyy' },
    Period: { name: 'postingperiod', type: 'string', txt: true },
    Type: {
      name: 'type',
      type: 'string',
      txt: true,
      filterformula: 'formulatext: {type}',
    },
    DocumentNumber: { name: 'tranid', type: 'string' },
    Name: {
      name: 'entity',
      type: 'string',
      filterformula: 'formulatext: {entity}',
    },
    Account: {
      name: 'account',
      type: 'string',
      txt: true,
      filterformula: 'formulatext: {account.number}',
    },
    Product: { name: 'name', join: 'class', type: 'string' },
    Location: { name: 'name', join: 'location', type: 'string' },
    Memo: { name: 'memo', type: 'string' },
    Amount: { name: 'amount', type: 'number' },
    Department: {
      name: 'department',
      type: 'string',
      txt: true,
      filterformula: 'formulatext: {department}',
    },
    Status: {
      name: 'status',
      type: 'string',
      filterformula: 'formulatext: {status}',
      txt: true,
    },
    Subsidiary: {
      name: 'subsidiary',
      type: 'string',
      txt: true,
      filterformula: 'formulatext: {subsidiary}',
    },
  };

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: 'Get Transactions',
        description:
          'Get List of Entries or Transactions' +
          `Output Schema of this tool: ${JSON.stringify(
            zodToJsonSchema(
              z.object({
                transactions: z
                  .array(
                    z.object({
                      Id: z.string().optional().describe('Id of the Transaction'),
                      Date: z.string().optional().describe('Date of the Transaction'),
                      Period: z
                        .string()
                        .optional()
                        .describe(
                          'Period of the Entry. Use Date column instead of Period for filter.'
                        ),
                      Type: z
                        .enum(['Bill', 'Bill Credit', 'Bill Payment', 'Journal'])
                        .optional()
                        .describe('Type of Transaction'),
                      DocumentNumber: z.string().optional().describe('Document Number'),
                      Name: z.string().optional().describe('Name of the entity'),
                      Account: z
                        .string()
                        .optional()
                        .describe(
                          'In output, Account is the Name of the Account associated with this bill. For Filter, this is the AccountNumber'
                        ),
                      Product: z
                        .string()
                        .optional()
                        .describe('Product/Class associated with transaction'),
                      Location: z
                        .string()
                        .optional()
                        .describe('Location associated with transaction'),
                      Memo: z.string().optional().describe('Memo of the Transaction'),
                      Amount: z.number().optional().describe('Amount of the Transaction'),
                      Department: z
                        .string()
                        .optional()
                        .describe('Department associated with transaction'),
                      Status: z
                        .enum([
                          'Approved for Posting',
                          'Paid In Full',
                          'Open',
                          'Pending Approval',
                          'Rejected',
                          'Voided',
                          'Undefined',
                        ])
                        .optional()
                        .describe('Status of the Transaction'),
                      Subsidiary: z
                        .string()
                        .optional()
                        .describe('Subsidiary associated with transaction'),
                    })
                  )
                  .describe(
                    'Array of transaction records. Present when CountOnly=false. Each transaction represents transaction/entry data.'
                  )
                  .optional(),
                Count: z
                  .number()
                  .int()
                  .positive()
                  .describe('Total number of transaction records. Present when CountOnly=true.')
                  .optional(),
              })
            )
          )}`,
        inputSchema: NetSuiteHelper.paramSchema,
      },
      async (input: GetTransactionsInput) => {
        const startTime = Date.now();

        try {
          NetSuiteHelper.validateParamFilters(input, {});
          // Use the searchRestlet helper method with specific filters for transactions
          const filters = [['type', 'anyof', 'VendBill', 'VendCred', 'VendPymt', 'Journal']];

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
              Module: 'getTransactions',
              Message: 'Successfully retrieved transactions count',
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
          const transactions = itemsResult.items || [];

          // Convert Id fields to strings and ensure proper typing
          const finalData = transactions.map((transaction) => ({
            ...transaction,
            Id: transaction.Id !== undefined ? String(transaction.Id) : undefined,
            Amount:
              typeof transaction.Amount === 'string'
                ? parseFloat(transaction.Amount)
                : transaction.Amount,
          }));

          const totalDuration = Date.now() - startTime;

          logger.info({
            Module: 'getTransactions',
            Message: 'Successfully retrieved transactions',
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
            structuredContent: { transactions: finalData },
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: 'getTransactions',
            Message: 'Error occurred during getTransactions execution',
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
                    message: 'Failed to get transactions from NetSuite',
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

import { NetSuiteHelper, SuiteScriptColumns } from '../helper';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import zodToJsonSchema from 'zod-to-json-schema';

interface GetCreditMemoInput {
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

export class GetCreditMemos {
  private readonly toolName = 'get-credit-memos';

  private readonly Columns: SuiteScriptColumns = {
    Id: { name: 'internalid', type: 'id' },
    CustomerName: { name: 'custbody_ava_customercompanyname', type: 'string' },
    Amount: { name: 'amount', type: 'string' },
    Date: { name: 'trandate', type: 'date' },
  };

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: 'Get Credit Memos',
        description:
          'Get List of Credit Memos' +
          `Output Schema of this tool: ${JSON.stringify(
            zodToJsonSchema(
              z.object({
                creditMemos: z
                  .array(
                    z.object({
                      Id: z.string().optional().describe('Id of the credit memo'),
                      CustomerName: z
                        .string()
                        .optional()
                        .describe('Customer name for which the credit memo is created'),
                      Amount: z.string().optional().describe('Amount of the Credit Memo'),
                      Date: z.string().optional().describe('Date of the credit memo'),
                    })
                  )
                  .describe(
                    'Array of credit memo records. Present when CountOnly=false. Each credit memo represents credit memo data.'
                  )
                  .optional(),
                Count: z
                  .number()
                  .int()
                  .positive()
                  .describe('Total number of credit memo records. Present when CountOnly=true.')
                  .optional(),
              })
            )
          )}`,
        inputSchema: NetSuiteHelper.paramSchema,
      },
      async (input: GetCreditMemoInput) => {
        const startTime = Date.now();

        try {
          NetSuiteHelper.validateParamFilters(input, {});

          // Use the searchRestlet helper method - equivalent to the old Implement method
          const result = await NetSuiteHelper.searchRestlet('creditmemo', this.Columns, input, [], {
            Column: 'Id',
            SortOrder: 'ASC',
          });

          // Handle count-only response
          if (input.CountOnly === true) {
            const countResult = result as { Count: number };

            logger.info({
              Module: 'getCreditMemo',
              Message: 'Successfully retrieved credit memo count',
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
          const creditMemos = itemsResult.items || [];

          // Convert Id fields to strings to match the schema
          const finalData = creditMemos.map((creditMemo) => ({
            ...creditMemo,
            Id: creditMemo.Id !== undefined ? String(creditMemo.Id) : undefined,
          }));

          const totalDuration = Date.now() - startTime;

          logger.info({
            Module: 'getCreditMemo',
            Message: 'Successfully retrieved credit memos',
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
            structuredContent: { creditMemos: finalData },
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: 'getCreditMemo',
            Message: 'Error occurred during getCreditMemo execution',
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
                    message: 'Failed to get credit memos from NetSuite',
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

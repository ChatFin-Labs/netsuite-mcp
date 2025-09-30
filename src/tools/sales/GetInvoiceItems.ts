import { NetSuiteHelper, SuiteScriptColumns } from '../helper';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import zodToJsonSchema from 'zod-to-json-schema';

interface GetInvoiceItemsInput {
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

export class GetInvoiceItems {
  private readonly toolName = 'get-invoice-items';

  private readonly Columns: SuiteScriptColumns = {
    Id: { name: 'internalid', type: 'id' },
    TranId: { name: 'tranid', type: 'string' },
    Amount: { name: 'amount', type: 'number' },
    Item: { name: 'item', type: 'string' },
  };

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: 'Get Invoice Items',
        description:
          'Get List of Items of the invoice' +
          `Output Schema of this tool: ${JSON.stringify(
            zodToJsonSchema(
              z.object({
                invoiceItems: z
                  .array(
                    z.object({
                      Id: z.string().optional().describe('Id of the Invoice'),
                      TranId: z.string().optional().describe('Entity id of the invoice'),
                      Amount: z.number().optional().describe('Amount of each item in invoice'),
                      Item: z.string().optional().describe('Internal Id of each item in invoice'),
                    })
                  )
                  .describe(
                    'Array of invoice item records. Present when CountOnly=false. Each invoice item represents line item data from invoices.'
                  )
                  .optional(),
                Count: z
                  .number()
                  .int()
                  .positive()
                  .describe('Total number of invoice item records. Present when CountOnly=true.')
                  .optional(),
              })
            )
          )}`,
        inputSchema: NetSuiteHelper.paramSchema,
      },
      async (input: GetInvoiceItemsInput) => {
        const startTime = Date.now();

        try {
          // Use the searchRestlet helper method with specific filters for invoice items
          const filters = [
            ['type', 'anyof', 'CustInvc'],
            'AND',
            ['item.type', 'anyof', 'InvtPart', 'NonInvtPart'],
          ];

          const result = await NetSuiteHelper.searchRestlet(
            'invoice',
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
              Module: 'getInvoiceItems',
              Message: 'Successfully retrieved invoice items count',
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
          const invoiceItems = itemsResult.items || [];

          // Convert Id fields to strings and ensure proper typing
          const finalData = invoiceItems.map((invoiceItem) => ({
            ...invoiceItem,
            Id: invoiceItem.Id !== undefined ? String(invoiceItem.Id) : undefined,
            Amount:
              typeof invoiceItem.Amount === 'string'
                ? parseFloat(invoiceItem.Amount)
                : invoiceItem.Amount,
          }));

          const totalDuration = Date.now() - startTime;

          logger.info({
            Module: 'getInvoiceItems',
            Message: 'Successfully retrieved invoice items',
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
            structuredContent: { invoiceItems: finalData },
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: 'getInvoiceItems',
            Message: 'Error occurred during getInvoiceItems execution',
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
                    message: 'Failed to get invoice items from NetSuite',
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

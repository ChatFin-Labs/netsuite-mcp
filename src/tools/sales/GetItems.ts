import { NetSuiteHelper, SuiteScriptColumns } from '../helper';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import zodToJsonSchema from 'zod-to-json-schema';

interface GetItemsInput {
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

export class GetItems {
  private readonly toolName = 'get-items';

  private readonly Columns: SuiteScriptColumns = {
    InternalId: { name: 'internalid', type: 'id' },
    Name: { name: 'itemid', type: 'string' },
    DisplayName: { name: 'displayname', type: 'string' },
    Description: { name: 'salesdescription', type: 'string' },
    Type: { name: 'type', type: 'string' },
    BasePrice: { name: 'baseprice', type: 'string' },
  };

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: 'Get Items',
        description:
          'Get List of all sellable Items with details' +
          `Output Schema of this tool: ${JSON.stringify(
            zodToJsonSchema(
              z.object({
                items: z
                  .array(
                    z.object({
                      InternalId: z.string().optional().describe('Id of the Item'),
                      Name: z.string().optional().describe('Name of the Item'),
                      DisplayName: z.string().optional().describe('Display name of the Item'),
                      Description: z.string().optional().describe('Description about the item'),
                      Type: z.string().optional().describe('Type of the item'),
                      BasePrice: z.string().optional().describe('Base price of the item'),
                    })
                  )
                  .describe(
                    'Array of item records. Present when CountOnly=false. Each item represents sellable item data.'
                  )
                  .optional(),
                Count: z
                  .number()
                  .int()
                  .positive()
                  .describe('Total number of item records. Present when CountOnly=true.')
                  .optional(),
              })
            )
          )}`,
        inputSchema: NetSuiteHelper.paramSchema,
      },
      async (input: GetItemsInput) => {
        const startTime = Date.now();

        try {
          // Use the searchRestlet helper method - equivalent to the old Implement method
          const result = await NetSuiteHelper.searchRestlet('item', this.Columns, input, [], {
            Column: 'Id',
            SortOrder: 'ASC',
          });

          // Handle count-only response
          if (input.CountOnly === true) {
            const countResult = result as { Count: number };

            logger.info({
              Module: 'getItems',
              Message: 'Successfully retrieved items count',
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
          const items = itemsResult.items || [];

          // Convert InternalId fields to strings to match the schema
          const finalData = items.map((item) => ({
            ...item,
            InternalId: item.InternalId !== undefined ? String(item.InternalId) : undefined,
          }));

          const totalDuration = Date.now() - startTime;

          logger.info({
            Module: 'getItems',
            Message: 'Successfully retrieved items',
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
            structuredContent: { items: finalData },
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: 'getItems',
            Message: 'Error occurred during getItems execution',
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
                    message: 'Failed to get items from NetSuite',
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

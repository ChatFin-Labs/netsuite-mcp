import { NetSuiteHelper, SuiteScriptColumns } from '../helper';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import zodToJsonSchema from 'zod-to-json-schema';

interface GetClassInput {
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

export class GetClasses {
  private readonly toolName = 'get-classes';

  private readonly Columns: SuiteScriptColumns = {
    Id: { name: 'internalid', type: 'id' },
    Name: { name: 'name', type: 'string' },
  };

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: 'Get Classes',
        description:
          'Get List of all Classes (Classifications)' +
          `Output Schema of this tool: ${JSON.stringify(
            zodToJsonSchema(
              z.object({
                classes: z
                  .array(
                    z.object({
                      Id: z.string().optional().describe('Id of the Class'),
                      Name: z.string().optional().describe('Name of the Class'),
                    })
                  )
                  .describe(
                    'Array of class records. Present when CountOnly=false. Each class represents classification data.'
                  )
                  .optional(),
                Count: z
                  .number()
                  .int()
                  .positive()
                  .describe('Total number of class records. Present when CountOnly=true.')
                  .optional(),
              })
            )
          )}`,
        inputSchema: NetSuiteHelper.paramSchema,
      },
      async (input: GetClassInput) => {
        const startTime = Date.now();

        try {
          // Use the searchRestlet helper method - equivalent to the old Implement method
          const result = await NetSuiteHelper.searchRestlet(
            'classification',
            this.Columns,
            input,
            [],
            {
              Column: 'Id',
              SortOrder: 'ASC',
            }
          );

          // Handle count-only response
          if (input.CountOnly === true) {
            const countResult = result as { Count: number };

            logger.info({
              Module: 'getClass',
              Message: 'Successfully retrieved class count',
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
          const classes = itemsResult.items || [];

          // Convert Id fields to strings to match the schema
          const finalData = classes.map((classItem) => ({
            ...classItem,
            Id: classItem.Id !== undefined ? String(classItem.Id) : undefined,
          }));

          const totalDuration = Date.now() - startTime;

          logger.info({
            Module: 'getClass',
            Message: 'Successfully retrieved classes',
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
            structuredContent: { classes: finalData },
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: 'getClass',
            Message: 'Error occurred during getClass execution',
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
                    message: 'Failed to get classes from NetSuite',
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

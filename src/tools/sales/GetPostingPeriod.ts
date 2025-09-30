import { NetSuiteHelper, SuiteScriptColumns } from '../helper';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import zodToJsonSchema from 'zod-to-json-schema';

interface GetPostingPeriodInput {
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

export class GetPostingPeriod {
  private readonly toolName = 'get-posting-period';

  private readonly Columns: SuiteScriptColumns = {
    Id: { name: 'internalid', type: 'id' },
    Name: { name: 'periodname', type: 'string' },
  };

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: 'Get Posting Period',
        description:
          'Get List of all posting periods' +
          `Output Schema of this tool: ${JSON.stringify(
            zodToJsonSchema(
              z.object({
                postingPeriods: z
                  .array(
                    z.object({
                      Id: z.string().optional().describe('Id of the posting period'),
                      Name: z.string().optional().describe('Period name'),
                    })
                  )
                  .describe(
                    'Array of posting period records. Present when CountOnly=false. Each posting period represents accounting period data.'
                  )
                  .optional(),
                Count: z
                  .number()
                  .int()
                  .positive()
                  .describe('Total number of posting period records. Present when CountOnly=true.')
                  .optional(),
              })
            )
          )}`,
        inputSchema: NetSuiteHelper.paramSchema,
      },
      async (input: GetPostingPeriodInput) => {
        const startTime = Date.now();

        try {
          // Use the searchRestlet helper method - equivalent to the old Implement method
          const result = await NetSuiteHelper.searchRestlet(
            'accountingperiod',
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
              Module: 'getPostingPeriod',
              Message: 'Successfully retrieved posting periods count',
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
          const postingPeriods = itemsResult.items || [];

          // Convert Id fields to strings to match the schema
          const finalData = postingPeriods.map((postingPeriod) => ({
            ...postingPeriod,
            Id: postingPeriod.Id !== undefined ? String(postingPeriod.Id) : undefined,
          }));

          const totalDuration = Date.now() - startTime;

          logger.info({
            Module: 'getPostingPeriod',
            Message: 'Successfully retrieved posting periods',
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
            structuredContent: { postingPeriods: finalData },
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: 'getPostingPeriod',
            Message: 'Error occurred during getPostingPeriod execution',
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
                    message: 'Failed to get posting periods from NetSuite',
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

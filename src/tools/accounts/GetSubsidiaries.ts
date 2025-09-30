import { NetSuiteHelper, SuiteScriptColumns } from '../helper';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import zodToJsonSchema from 'zod-to-json-schema';

interface GetSubsidiariesInput {
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

export class GetSubsidiaries {
  private readonly toolName = 'get-subsidiaries';

  private readonly Columns: SuiteScriptColumns = {
    Id: { name: 'internalid', type: 'id' },
    Name: { name: 'namenohierarchy', type: 'string' },
    ParentId: { name: 'parent', type: 'id' },
  };

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: 'Get Subsidiaries',
        description:
          'Get List of all Subsidiaries' +
          `Output Schema of this tool: ${JSON.stringify(
            zodToJsonSchema(
              z.object({
                subsidiaries: z
                  .array(
                    z.object({
                      Id: z.string().optional().describe('Id of the Subsidiary'),
                      Name: z.string().optional().describe('Name of the Subsidiary'),
                      ParentId: z.string().optional().describe('Parent Id of the Subsidiary'),
                    })
                  )
                  .describe(
                    'Array of subsidiary records. Present when CountOnly=false. Each subsidiary represents subsidiary data.'
                  )
                  .optional(),
              })
            )
          )}`,
        inputSchema: NetSuiteHelper.paramSchema,
      },
      async (input: GetSubsidiariesInput) => {
        const startTime = Date.now();

        try {
          // Use the searchRestlet helper method - equivalent to the old Implement method
          const result = await NetSuiteHelper.searchRestlet('subsidiary', this.Columns, {}, [], {
            Column: 'Id',
            SortOrder: 'ASC',
          });

          // Handle items response
          const itemsResult = result as { items?: Record<string, unknown>[] };
          const subsidiaries = itemsResult.items || [];

          // Convert Id fields to strings to match the schema
          const finalData = subsidiaries.map((subsidiary) => ({
            ...subsidiary,
            Id: subsidiary.Id !== undefined ? String(subsidiary.Id) : undefined,
            ParentId: subsidiary.ParentId !== undefined ? String(subsidiary.ParentId) : undefined,
          }));

          const totalDuration = Date.now() - startTime;

          logger.info({
            Module: 'getSubsidiaries',
            Message: 'Successfully retrieved subsidiaries',
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
            structuredContent: { subsidiaries: finalData },
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: 'getSubsidiaries',
            Message: 'Error occurred during getSubsidiaries execution',
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
}

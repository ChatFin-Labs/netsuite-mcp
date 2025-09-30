import { NetSuiteHelper, SuiteScriptColumns } from '../helper';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import zodToJsonSchema from 'zod-to-json-schema';

interface GetCustomersInput {
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

export class GetCustomers {
  private readonly toolName = 'get-customers';

  private readonly Columns: SuiteScriptColumns = {
    Id: { name: 'internalid', type: 'id' },
    Name: { name: 'entityid', type: 'string' },
    Email: { name: 'email', type: 'string' },
    Phone: { name: 'phone', type: 'string' },
    OfficePhone: { name: 'altphone', type: 'string' },
    Fax: { name: 'fax', type: 'string' },
    PrimaryContact: { name: 'contact', type: 'string' },
    AltEmail: { name: 'altemail', type: 'string' },
  };

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: 'Get Customers',
        description:
          'Get List of all Customers with contact information' +
          `Output Schema of this tool: ${JSON.stringify(
            zodToJsonSchema(
              z.object({
                customers: z
                  .array(
                    z.object({
                      Id: z.string().optional().describe('Id of the Customer'),
                      Name: z.string().optional().describe('Name of the Customer'),
                      Email: z.string().optional().describe('Email of the Customer'),
                      Phone: z.string().optional().describe('Phone number of the Customer'),
                      OfficePhone: z
                        .string()
                        .optional()
                        .describe('Alternate Phone number of the Customer'),
                      Fax: z.string().optional().describe('Fax of the Customer'),
                      PrimaryContact: z
                        .string()
                        .optional()
                        .describe('Primary Contact of the Customer'),
                      AltEmail: z.string().optional().describe('Alternate Email of the Customer'),
                    })
                  )
                  .describe(
                    'Array of customer records. Present when CountOnly=false. Each customer represents customer data with contact information.'
                  )
                  .optional(),
                Count: z
                  .number()
                  .int()
                  .positive()
                  .describe('Total number of customer records. Present when CountOnly=true.')
                  .optional(),
              })
            )
          )}`,
        inputSchema: NetSuiteHelper.paramSchema,
      },
      async (input: GetCustomersInput) => {
        const startTime = Date.now();

        try {
          // Use the searchRestlet helper method - equivalent to the old Implement method
          const result = await NetSuiteHelper.searchRestlet('customer', this.Columns, input, [], {
            Column: 'Id',
            SortOrder: 'ASC',
          });

          // Handle count-only response
          if (input.CountOnly === true) {
            const countResult = result as { Count: number };

            logger.info({
              Module: 'getCustomers',
              Message: 'Successfully retrieved customer count',
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
          const customers = itemsResult.items || [];

          // Convert Id fields to strings to match the schema
          const finalData = customers.map((customer) => ({
            ...customer,
            Id: customer.Id !== undefined ? String(customer.Id) : undefined,
          }));

          const totalDuration = Date.now() - startTime;

          logger.info({
            Module: 'getCustomers',
            Message: 'Successfully retrieved customers',
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
            structuredContent: { customers: finalData },
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: 'getCustomers',
            Message: 'Error occurred during getCustomers execution',
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
                    message: 'Failed to get customers from NetSuite',
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

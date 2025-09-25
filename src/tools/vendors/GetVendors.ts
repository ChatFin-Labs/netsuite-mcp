import { NetSuiteHelper, SuiteScriptColumns } from '../helper';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../../utils/logger';

interface GetVendorsInput {
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

export class GetVendors {
  private readonly toolName = 'get-vendors';

  private readonly Columns: SuiteScriptColumns = {
    Id: { name: 'internalid', type: 'id' },
    Name: { name: 'entityid', type: 'string' },
    Email: { name: 'email', type: 'string' },
    Phone: { name: 'phone', type: 'string' },
    OfficePhone: { name: 'altphone', type: 'string' },
    Fax: { name: 'fax', type: 'string' },
    AltEmail: { name: 'altemail', type: 'string' },
  };

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: 'Get Vendors',
        description: 'Get List of all Vendors with contact information',
        inputSchema: NetSuiteHelper.paramSchema,
        outputSchema: {
          vendors: z
            .array(
              z.object({
                Id: z.string().optional().describe('Id of the Vendor'),
                Name: z.string().optional().describe('Name of the Vendor'),
                Email: z.string().optional().describe('Email of the Vendor'),
                Phone: z.string().optional().describe('Phone number of the Vendor'),
                OfficePhone: z.string().optional().describe('Office Phone number of the Vendor'),
                Fax: z.string().optional().describe('Fax of the Vendor'),
                AltEmail: z.string().optional().describe('Alternate Email of the Vendor'),
              })
            )
            .describe(
              'Array of vendor records. Present when CountOnly=false. Each vendor represents vendor data with contact information.'
            )
            .optional(),
          Count: z
            .number()
            .int()
            .positive()
            .describe(
              'Total number of vendor records. Present when CountOnly=true.'
            )
            .optional(),
        },
      },
      async (input: GetVendorsInput) => {
        const startTime = Date.now();

        try {
          // Use the searchRestlet helper method - equivalent to the old Implement method
          const result = await NetSuiteHelper.searchRestlet('vendor', this.Columns, input, [], {
            Column: 'Id',
            SortOrder: 'ASC',
          });

          // Handle count-only response
          if (input.CountOnly === true) {
            const countResult = result as { Count: number };
            
            logger.info({
              Module: 'getVendors',
              Message: 'Successfully retrieved vendor count',
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
          const vendors = itemsResult.items || [];

          // Convert Id fields to strings to match the schema
          const finalData = vendors.map((vendor) => ({
            ...vendor,
            Id: vendor.Id !== undefined ? String(vendor.Id) : undefined,
          }));

          const totalDuration = Date.now() - startTime;

          logger.info({
            Module: 'getVendors',
            Message: 'Successfully retrieved vendors',
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
            structuredContent: { vendors: finalData },
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: 'getVendors',
            Message: 'Error occurred during getVendors execution',
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
                    message: 'Failed to get vendors from NetSuite',
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
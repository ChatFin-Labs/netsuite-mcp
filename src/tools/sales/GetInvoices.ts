import { NetSuiteHelper, SuiteScriptColumns } from '../helper';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import zodToJsonSchema from 'zod-to-json-schema';

interface GetInvoicesInput {
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

export class GetInvoices {
  private readonly toolName = 'get-invoices';

  private readonly Columns: SuiteScriptColumns = {
    Id: { name: 'internalid', type: 'id' },
    Number: { name: 'tranid', type: 'string' },
    Date: { name: 'trandate', type: 'date', format: 'M/d/yyyy' },
    Period: { name: 'postingperiod', type: 'string', txt: true },
    Customer: { name: 'entityid', join: 'customer', type: 'string' },
    Account: {
      name: 'account',
      type: 'string',
      txt: true,
      filterformula: 'formulatext: {account.number}',
    },
    Status: {
      name: 'status',
      type: 'string',
      filterformula: 'formulatext: {status}',
      txt: true,
    },
    Amount: { name: 'amount', type: 'number' },
    AmountRemaining: { name: 'amountremaining', type: 'number' },
    DueDate: { name: 'duedate', type: 'date', format: 'M/d/yyyy' },
    Memo: { name: 'memo', type: 'string' },
  };

  private readonly outputSchema = {
    invoices: z
      .array(
        z.object({
          Id: z.string().optional().describe('Id of the Invoice'),
          Number: z.string().optional().describe('Number of the Invoice'),
          Date: z.string().optional().describe('Date of the Invoice'),
          Period: z
            .string()
            .optional()
            .describe('Period of the Invoice. Do not use Period for filter, use Date column.'),
          Account: z
            .string()
            .optional()
            .describe(
              'In output, Account is the Name of the Account associated with this Invoice. For Filter, this is the AccountNumber'
            ),
          Customer: z.string().optional().describe('Name of the Customer of this Invoice'),
          Status: z
            .enum(['Paid In Full', 'Open', 'Pending Approval', 'Rejected', 'Voided', 'Undefined'])
            .optional()
            .describe('Status of the Invoice'),
          Amount: z.number().optional().describe('Amount of the Invoice'),
          AmountRemaining: z.number().optional().describe('Amount Remaining of the Invoice'),
          DueDate: z
            .string()
            .optional()
            .describe('Due Date of the Invoice. This is the Date part only'),
          Memo: z.string().optional().describe('Memo of the Invoice'),
        })
      )
      .describe(
        'Array of invoice records. Present when CountOnly=false. Each invoice represents invoice data.'
      )
      .optional(),
    Count: z
      .number()
      .int()
      .positive()
      .describe('Total number of invoice records. Present when CountOnly=true.')
      .optional(),
  };

  private readonly samples: Array<string> = [
    'What are my open invoices?',
    'How many invoices are there?',
    'Show me all invoices created in Oct 2023',
    'Show me the invoices for the customer CustName',
    'Show me the invoices for the customer CustName that are open in status and amount less than $5000',
  ];

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: 'Get Invoices',
        description:
          'Get List of Open Invoices with detailed information' +
          `\n${this.samples.length > 0 ? 'Example Prompts:\n' + this.samples.join('\n') : ''}` +
          `\nOutput Schema of this tool: ${JSON.stringify(
            zodToJsonSchema(z.object(this.outputSchema))
          )}`,
        inputSchema: NetSuiteHelper.paramSchema,
        outputSchema: this.outputSchema,
      },
      async (input: GetInvoicesInput) => {
        const startTime = Date.now();

        try {
          NetSuiteHelper.validateParamFilters(input, {});

          // Use the searchRestlet helper method with specific filters for invoices
          const filters = [
            ['type', 'anyof', 'CustInvc'],
            'AND',
            ['mainline', 'is', 'T'],
            'AND',
            ['memorized', 'is', 'F'],
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
              Module: 'getInvoices',
              Message: 'Successfully retrieved invoices count',
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
          const invoices = itemsResult.items || [];

          // Convert Id fields to strings and ensure proper typing
          const finalData = invoices.map((invoice) => ({
            ...invoice,
            Id: invoice.Id !== undefined ? String(invoice.Id) : undefined,
            Amount:
              typeof invoice.Amount === 'string' ? parseFloat(invoice.Amount) : invoice.Amount,
            AmountRemaining:
              typeof invoice.AmountRemaining === 'string'
                ? parseFloat(invoice.AmountRemaining)
                : invoice.AmountRemaining,
          }));

          const totalDuration = Date.now() - startTime;

          logger.info({
            Module: 'getInvoices',
            Message: 'Successfully retrieved invoices',
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
            structuredContent: { invoices: finalData },
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: 'getInvoices',
            Message: 'Error occurred during getInvoices execution',
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
                    message: 'Failed to get invoices from NetSuite',
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

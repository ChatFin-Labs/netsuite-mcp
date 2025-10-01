import { NetSuiteHelper, SuiteScriptColumns } from "../helper";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger";
import zodToJsonSchema from "zod-to-json-schema";

interface GetBillsInput {
  CountOnly?: boolean;
  OrderBy?: {
    Column: string;
    SortOrder?: "DESC" | "ASC" | "";
  };
  Filters?: Array<{
    Column: string;
    Operator: "<" | "<=" | ">" | ">=" | "=" | "!=" | "Like" | "Not_Like";
    Value: string;
  }>;
  Limit?: number;
  Offset?: number;
}

export class GetBills {
  private readonly toolName = "get-bills";

  private readonly Columns: SuiteScriptColumns = {
    Id: { name: "internalid", type: "id" },
    Date: { name: "trandate", type: "date", format: "M/d/yyyy" },
    Period: { name: "postingperiod", type: "string", txt: true },
    LastBillPaymentDate: {
      name: "closedate",
      type: "date",
      format: "M/d/yyyy",
    },
    Type: {
      name: "type",
      type: "string",
      txt: true,
      filterformula: "formulatext: {type}",
    },
    DocumentNumber: { name: "tranid", type: "string" },
    TransactionNumber: { name: "transactionnumber", type: "string" },
    Amount: { name: "amount", type: "number" },
    Account: {
      name: "account",
      type: "string",
      txt: true,
      filterformula: "formulatext: {account.number}",
    },
    Memo: { name: "memomain", type: "string" },
    Vendor: { name: "entityid", join: "vendor", type: "string" },
    Department: {
      name: "department",
      type: "string",
      txt: true,
      filterformula: "formulatext: {department}",
    },
    Subsidiary: {
      name: "subsidiary",
      type: "string",
      txt: true,
      filterformula: "formulatext: {subsidiary}",
    },
    AmortScheduleName: {
      name: "name",
      join: "amortizationSchedule",
      type: "string",
    },
    AmortStartDate: {
      name: "revrecstartdate",
      type: "date",
      format: "M/d/yyyy",
    },
    AmortEndDate: { name: "revrecenddate", type: "date", format: "M/d/yyyy" },
    Status: {
      name: "status",
      type: "string",
      txt: true,
      filterformula: "formulatext: {status}",
    },
  };

  private readonly outputSchema = {
    bills: z
      .array(
        z.object({
          Id: z.string().optional().describe("Id of the Bill"),
          Date: z.string().optional().describe("Date of the Bill"),
          Period: z
            .string()
            .optional()
            .describe("Period of the Bill. Use Date column instead of Period for filter."),
          LastBillPaymentDate: z.string().optional().describe("Last bill payment date"),
          Type: z.enum(["Bill", "Bill Credit", "Bill Payment"]).optional().describe("Type of Bill"),
          DocumentNumber: z.string().optional().describe("Document Number"),
          TransactionNumber: z.string().optional().describe("Transaction Number"),
          Memo: z.string().optional().describe("Memo of the Bill"),
          Amount: z.number().optional().describe("Amount of the Bill"),
          Account: z
            .string()
            .optional()
            .describe(
              "In output, Account is the Name of the Account associated with this bill. For Filter, this is the AccountNumber"
            ),
          Vendor: z.string().optional().describe("Name of the Vendor of this Bill"),
          Department: z.string().optional().describe("Department associated with Bill"),
          Subsidiary: z.string().optional().describe("Subsidiary associated with Bill"),
          AmortScheduleName: z.string().optional().describe("Amortization Schedule Name"),
          AmortStartDate: z.string().optional().describe("Amortization Schedule Start Date"),
          AmortEndDate: z.string().optional().describe("Amortization Schedule End Date"),
          Status: z
            .enum([
              "Cancelled",
              "Open",
              "Paid In Full",
              "Payment In-Transit",
              "Pending Approval",
              "Rejected",
            ])
            .optional()
            .describe("Status of the Bill"),
        })
      )
      .describe(
        "Array of bill records. Present when CountOnly=false. Each bill represents vendor bill data."
      )
      .optional(),
    Count: z
      .number()
      .int()
      .positive()
      .describe("Total number of bill records. Present when CountOnly=true.")
      .optional(),
  };

  private readonly samples: Array<string> = [
    "Get me all the Bills for Oct 2023",
    "Get me unapproved Bills for Oct 2023",
    "Get me the Bill for the vendor ${VendorName}",
    "Show me the Bill for the vendor ${VendorName} for ${Period}",
    "Show me the Bill for the vendor ${VendorName} for ${Period} that are Paid and amount less than $5000",
  ];

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: "Get Bills",
        description:
          "Get List of Bills of Vendors" +
          `\n${this.samples.length > 0 ? "Example Prompts:\n" + this.samples.join("\n") : ""}` +
          `\nOutput Schema of this tool: ${JSON.stringify(
            zodToJsonSchema(z.object(this.outputSchema))
          )}`,
        inputSchema: NetSuiteHelper.paramSchema,
        outputSchema: this.outputSchema,
      },
      async (input: GetBillsInput) => {
        const startTime = Date.now();

        try {
          NetSuiteHelper.validateParamFilters(input, {});
          // Use the searchRestlet helper method with specific filters for bills
          const filters = [["type", "anyof", "VendBill", "VendCred", "VendPymt"]];

          const result = await NetSuiteHelper.searchRestlet(
            "transaction",
            this.Columns,
            input,
            filters,
            {
              Column: "Date",
              SortOrder: "DESC",
            }
          );

          // Handle count-only response
          if (input.CountOnly === true) {
            const countResult = result as { Count: number };

            logger.info({
              Module: "getBills",
              Message: "Successfully retrieved bills count",
              ObjectMsg: {
                count: countResult.Count,
                executionTime: Date.now() - startTime,
              },
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(countResult, null, 2),
                },
              ],
              structuredContent: countResult,
            };
          }

          // Handle items response
          const itemsResult = result as { items?: Record<string, unknown>[] };
          const bills = itemsResult.items || [];

          // Convert Id fields to strings and ensure proper typing
          const finalData = bills.map((bill) => ({
            ...bill,
            Id: bill.Id !== undefined ? String(bill.Id) : undefined,
            Amount: typeof bill.Amount === "string" ? parseFloat(bill.Amount) : bill.Amount,
          }));

          const totalDuration = Date.now() - startTime;

          logger.info({
            Module: "getBills",
            Message: "Successfully retrieved bills",
            ObjectMsg: {
              itemsReturned: finalData.length,
              executionTime: totalDuration,
            },
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(finalData, null, 2),
              },
            ],
            structuredContent: { bills: finalData },
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: "getBills",
            Message: "Error occurred during getBills execution",
            ObjectMsg: {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              input: input,
              executionTime: totalDuration,
            },
          });

          const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: errorMessage,
                    message: "Failed to get bills from NetSuite",
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

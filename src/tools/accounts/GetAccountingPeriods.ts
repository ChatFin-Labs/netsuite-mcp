import { NetSuiteHelper, SuiteQLColumns } from "../helper";
import { transform } from "../../utils/transform";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger";

interface GetAccountingPeriodsInput {
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

export class GetAccountingPeriods {
  private readonly toolName = "get-accounting-periods";

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: "Get Accounting Periods",
        description: "Get List of all accounting periods",
        inputSchema: NetSuiteHelper.paramSchema,
        outputSchema: {
          accountingPeriods: z
            .array(
              z.object({
                Id: z.string().optional().describe("Id of the Accounting Period"),
                StartDate: z.string().optional().describe("Start date of the period"),
                EndDate: z.string().optional().describe("End date of the period"),
              })
            )
            .describe(
              "Array of accounting period records. Present when CountOnly=false. Each period represents accounting period data."
            )
            .optional(),
          Count: z
            .number()
            .int()
            .positive()
            .describe(
              "Total number of accounting period records. Present when CountOnly=true."
            )
            .optional(),
        },
      },
      async (input: GetAccountingPeriodsInput) => {
        const startTime = Date.now();

        try {
          // Clean up input - handle empty strings in OrderBy.SortOrder
          if (input.OrderBy && input.OrderBy.SortOrder === "") {
            input.OrderBy.SortOrder = "DESC";
          }

          const sql = `SELECT {Columns} FROM AccountingPeriod ap 
                      WHERE ap.isQuarter = 'F' AND ap.isYear = 'F'`;

          const Columns: SuiteQLColumns = {
            Id: { sql: "ap.Id", type: "number" },
            StartDate: { sql: "ap.startDate", type: "date" },
            EndDate: { sql: "ap.endDate", type: "date" },
          };

          const formattedSQL = NetSuiteHelper.formatSQL(
            sql,
            Columns,
            input,
            "",
            {
              Column: "StartDate",
              SortOrder: "Desc",
            }
          );

          let totalData = [];
          let continueLoop = true;
          let dataOffset = 0;

          while (continueLoop) {
            // Add a small delay to prevent overwhelming the API and allow for better error handling
            if (dataOffset > 0) {
              await new Promise((resolve) => setTimeout(resolve, 100));
            }

            // Use SuiteQL helper to execute the query
            const data = await NetSuiteHelper.executeSuiteQL(
              formattedSQL,
              dataOffset
            );

            if (input.CountOnly === true) {
              const countResult = { Count: data.count };

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

            const output = transform(data.items, Columns);
            totalData.push(...output);

            if (data.hasMore) {
              dataOffset = data.offset + data.count;
            } else {
              continueLoop = false;
            }
          }

          // Convert Id fields to strings to match the schema
          const finalData = totalData.map((period) => ({
            ...period,
            Id: period.Id !== undefined ? String(period.Id) : undefined,
          }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(finalData, null, 2),
              },
            ],
            structuredContent: { accountingPeriods: finalData },
          };
        } catch (error) {
          logger.error({
            Module: "getAccountingPeriods",
            Message: "Error occurred during getAccountingPeriods execution",
            ObjectMsg: {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              input: input,
              executionTime: Date.now() - startTime,
            },
          });

          const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred";

          return {
            content: [
              {
                type: "text",
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

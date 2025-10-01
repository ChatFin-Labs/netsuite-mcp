import { NetSuiteHelper, SuiteScriptColumns } from "../helper";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger";
import zodToJsonSchema from "zod-to-json-schema";

interface GetDepartmentInput {
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

export class GetDepartments {
  private readonly toolName = "get-departments";

  private readonly Columns: SuiteScriptColumns = {
    Id: { name: "internalid", type: "id" },
    Name: { name: "name", type: "string" },
  };

  private readonly outputSchema = {
    departments: z
      .array(
        z.object({
          Id: z.string().optional().describe("Id of the Department"),
          Name: z.string().optional().describe("Name of the Department"),
        })
      )
      .describe(
        "Array of department records. Present when CountOnly=false. Each department represents department data."
      )
      .optional(),
    Count: z
      .number()
      .int()
      .positive()
      .describe("Total number of department records. Present when CountOnly=true.")
      .optional(),
  };

  private readonly samples: Array<string> = [];

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: "Get Departments",
        description:
          "Get List of all Departments" +
          `\n${this.samples.length > 0 ? "Example Prompts:\n" + this.samples.join("\n") : ""}` +
          `\nOutput Schema of this tool: ${JSON.stringify(
            zodToJsonSchema(z.object(this.outputSchema))
          )}`,
        inputSchema: NetSuiteHelper.paramSchema,
        outputSchema: this.outputSchema,
      },
      async (input: GetDepartmentInput) => {
        const startTime = Date.now();

        try {
          // Use the searchRestlet helper method - equivalent to the old Implement method
          const result = await NetSuiteHelper.searchRestlet("department", this.Columns, input, [], {
            Column: "Id",
            SortOrder: "ASC",
          });

          // Handle count-only response
          if (input.CountOnly === true) {
            const countResult = result as { Count: number };

            logger.info({
              Module: "getDepartment",
              Message: "Successfully retrieved department count",
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
          const departments = itemsResult.items || [];

          // Convert Id fields to strings to match the schema
          const finalData = departments.map((department) => ({
            ...department,
            Id: department.Id !== undefined ? String(department.Id) : undefined,
          }));

          const totalDuration = Date.now() - startTime;

          logger.info({
            Module: "getDepartment",
            Message: "Successfully retrieved departments",
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
            structuredContent: { departments: finalData },
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: "getDepartment",
            Message: "Error occurred during getDepartment execution",
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
                    message: "Failed to get departments from NetSuite",
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

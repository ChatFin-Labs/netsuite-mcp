import { NetSuiteHelper, SuiteScriptColumns } from "../helper";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger";
import zodToJsonSchema from "zod-to-json-schema";

interface GetLocationInput {
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

export class GetLocations {
  private readonly toolName = "get-locations";

  private readonly Columns: SuiteScriptColumns = {
    Id: { name: "internalid", type: "id" },
    Name: { name: "name", type: "string" },
  };

  private readonly outputSchema = {
    locations: z
      .array(
        z.object({
          Id: z.string().optional().describe("Id of the Location"),
          Name: z.string().optional().describe("Name of the Location"),
        })
      )
      .describe(
        "Array of location records. Present when CountOnly=false. Each location represents location data."
      )
      .optional(),
    Count: z
      .number()
      .int()
      .positive()
      .describe("Total number of location records. Present when CountOnly=true.")
      .optional(),
  };

  private readonly samples: Array<string> = [];

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: "Get Locations",
        description:
          "Get List of all Locations" +
          `\n${this.samples.length > 0 ? "Example Prompts:\n" + this.samples.join("\n") : ""}` +
          `\nOutput Schema of this tool: ${JSON.stringify(
            zodToJsonSchema(z.object(this.outputSchema))
          )}`,
        inputSchema: NetSuiteHelper.paramSchema,
        outputSchema: this.outputSchema,
      },
      async (input: GetLocationInput) => {
        const startTime = Date.now();

        try {
          // Use the searchRestlet helper method - equivalent to the old Implement method
          const result = await NetSuiteHelper.searchRestlet("location", this.Columns, input, [], {
            Column: "Id",
            SortOrder: "ASC",
          });

          // Handle count-only response
          if (input.CountOnly === true) {
            const countResult = result as { Count: number };

            logger.info({
              Module: "getLocation",
              Message: "Successfully retrieved location count",
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
          const locations = itemsResult.items || [];

          // Convert Id fields to strings to match the schema
          const finalData = locations.map((location) => ({
            ...location,
            Id: location.Id !== undefined ? String(location.Id) : undefined,
          }));

          const totalDuration = Date.now() - startTime;

          logger.info({
            Module: "getLocation",
            Message: "Successfully retrieved locations",
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
            structuredContent: { locations: finalData },
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: "getLocation",
            Message: "Error occurred during getLocation execution",
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
                    message: "Failed to get locations from NetSuite",
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

import { NetSuiteHelper, SuiteQLColumns } from "../helper";
import { transform } from "../../utils/transform";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger";

interface GetAccountsInput {
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

export class GetAccounts {
  private readonly toolName = "get-accounts";
  private readonly accountTypes = process.env.NETSUITE_ACCOUNT_TYPES
    ? process.env.NETSUITE_ACCOUNT_TYPES.split(",").map((type) => type.trim())
    : [];

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: "Get Accounts",
        description:
          "Get List of Accounts, this can be used to get all Accounts or specific Accounts information",
        inputSchema: NetSuiteHelper.paramSchema,
        outputSchema: {
          accounts: z
            .array(
              z.object({
                Id: z.string().optional().describe("Id of the Account"),
                Name: z.string().optional().describe("Name of the Account"),
                AccountNumber: z
                  .string()
                  .optional()
                  .describe("Number of the Account"),
                ParentNumber: z
                  .string()
                  .optional()
                  .describe(
                    "Parent Number of the Account. Hierarchy can be created by referencing this with AccountNumber property"
                  ),
                Type:
                  this.accountTypes.length > 0
                    ? z
                        .enum(this.accountTypes as [string, ...string[]])
                        .optional()
                        .describe("Type of the Account")
                    : z.string().optional().describe("Type of the Account"),
              })
            )
            .describe(
              "Array of account records. Present when CountOnly=false. Each account represents account data."
            )
            .optional(),
          Count: z
            .number()
            .int()
            .positive()
            .describe(
              "Total number of account records. Present when CountOnly=true."
            )
            .optional(),
        },
      },
      async (input: GetAccountsInput) => {
        const startTime = Date.now();

        try {
          // Clean up input - handle empty strings in OrderBy.SortOrder
          if (input.OrderBy && input.OrderBy.SortOrder === "") {
            input.OrderBy.SortOrder = "ASC";
          }
          const sql = `SELECT {Columns} FROM Account a`;

          const Columns: SuiteQLColumns = {
            Id: { sql: "a.Id", type: "number" },
            Name: { sql: "a.accountSearchDisplayNameCopy", type: "string" },
            AccountNumber: { sql: "a.acctNumber", type: "string" },
            ParentId: { sql: "a.parent", type: "number" },
            Type: { sql: "BUILTIN.DF(a.acctType)", type: "string" },
          };

          const formattedSQL = NetSuiteHelper.formatSQL(
            sql,
            Columns,
            input,
            "",
            {
              Column: "Name",
              SortOrder: "Asc",
            }
          );

          // Get SuiteQL tool handler - we'll need to call SuiteQL with the formatted query
          // For now, placeholder data structure matching v1 pattern
          let totalData = [];
          let continueLoop = true;
          let dataOffset = 0;

          while (continueLoop) {
            // Add a small delay to prevent overwhelming the API and allow for better error handling
            if (dataOffset > 0) {
              await new Promise((resolve) => setTimeout(resolve, 100));
            }

            // Use SuiteQL helper to execute the query (v1 pattern)
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

          // Update parent numbers from IDs (v1 logic)
          const processedData = this.updateParentNumberFromId(totalData);

          // Convert Id fields to strings to match the schema
          const finalData = processedData.map((account) => ({
            ...account,
            Id: account.Id !== undefined ? String(account.Id) : undefined,
          }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(finalData, null, 2),
              },
            ],
            structuredContent: { accounts: finalData },
          };
        } catch (error) {
          logger.error({
            Module: "getAccounts",
            Message: "Error occurred during getAccounts execution",
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

  private updateParentNumberFromId(data: Record<string, unknown>[]): Record<string, unknown>[] {
    // Convert the array to a map for direct access by Id
    const idToItemMap = new Map(data.map((item) => [item.Id, item]));

    // Iterate over the array and add "Parent Name"
    data.forEach((item) => {
      if (item.ParentId) {
        const parentItem = idToItemMap.get(item.ParentId);
        if (parentItem && typeof parentItem === 'object' && parentItem !== null) {
          const parentObj = parentItem as Record<string, unknown>;
          item.ParentNumber = parentObj.AccountNumber;
        }
        delete item.ParentId;
      }
    });

    return data;
  }
}

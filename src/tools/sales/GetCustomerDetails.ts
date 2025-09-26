import { NetSuiteHelper } from '../helper';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../../utils/logger';
import { fuzzySearch } from '../../utils/fuzzySearch';

interface CustomerDetailsInput {
  searchValue: string;
}

export class GetCustomerDetails {
  private readonly toolName = 'get-customer-details';

  public register(server: McpServer) {
    server.registerTool(
      this.toolName,
      {
        title: 'Get Customer Details',
        description: 'Find a specific customer by name or ID with fuzzy search capabilities',
        inputSchema: {
          searchValue: z.string().describe('Customer name or ID to search for'),
        },
        outputSchema: {
          customer: z
            .object({
              Id: z.number().describe('ID of the Customer'),
              Name: z.string().describe('Name of the Customer'),
            })
            .describe('The matched customer details'),
        },
      },
      async (input: CustomerDetailsInput) => {
        const startTime = Date.now();

        try {
          if (!input.searchValue || input.searchValue.trim() === '') {
            const errorMessage = 'searchValue cannot be empty.';
            logger.info({
              Module: 'customerDetails',
              Message: errorMessage,
              ObjectMsg: {
                searchValue: input.searchValue,
                executionTime: Date.now() - startTime,
              },
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      error: errorMessage,
                      searchValue: input.searchValue,
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

          const { searchValue } = input;

          // Prepare filters for searching by name and potentially by ID
          const filtersList = [{ Column: 'Name', Operator: 'Like' as const, Value: searchValue }];

          if (!isNaN(Number(searchValue))) {
            filtersList.push({
              Column: 'Id',
              Operator: 'Like' as const,
              Value: searchValue,
            });
          }

          const combinedResults: Record<string, unknown>[] = [];

          // Search with each filter
          for (const filter of filtersList) {
            const searchParams = { Filters: [filter] };

            // Use searchRestlet to get customers - we need the basic columns for matching
            const columns = {
              Id: { name: 'internalid', type: 'id' as const },
              Name: { name: 'entityid', type: 'string' as const },
            };

            const result = await NetSuiteHelper.searchRestlet(
              'customer',
              columns,
              searchParams,
              [],
              {
                Column: 'Id',
                SortOrder: 'ASC',
              }
            );

            const itemsResult = result as { items?: Record<string, unknown>[] };
            const customers = itemsResult.items || [];
            combinedResults.push(...customers);
          }

          // Remove duplicates based on Id
          const uniqueResults = Array.from(
            new Map(combinedResults.map((item) => [item.Id, item])).values()
          );

          // Apply fuzzy search
          const fuzzyName = fuzzySearch(uniqueResults, searchValue, 'Name', true);
          const fuzzyId = !isNaN(Number(searchValue))
            ? fuzzySearch(uniqueResults, searchValue, 'Id', true)
            : [];

          const fuzzyCombined = [...fuzzyName, ...fuzzyId];
          const dedupedFuzzy = Array.from(
            new Map(fuzzyCombined.map((item) => [item.Id, item])).values()
          );

          // Check for exact matches
          const exactMatch = dedupedFuzzy.filter(
            (item) =>
              item.Name === searchValue ||
              (!isNaN(Number(searchValue)) && item.Id?.toString() === searchValue)
          );

          const result = exactMatch.length > 0 ? exactMatch : dedupedFuzzy;

          // Handle different result scenarios
          if (result.length === 0) {
            const errorMessage = 'No customer record matches your input.';
            logger.info({
              Module: 'customerDetails',
              Message: errorMessage,
              ObjectMsg: {
                searchValue,
                executionTime: Date.now() - startTime,
              },
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      error: errorMessage,
                      searchValue,
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          } else if (result.length > 5) {
            const errorMessage = `${result.length} customer records match your request. Please give more specifics.`;
            logger.info({
              Module: 'customerDetails',
              Message: errorMessage,
              ObjectMsg: {
                searchValue,
                matchCount: result.length,
                executionTime: Date.now() - startTime,
              },
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      error: errorMessage,
                      searchValue,
                      matchCount: result.length,
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          } else if (result.length > 1) {
            const names = result.map((r) => `"${r.Name}"`).join(', ');
            const errorMessage = `${result.length} customers ${names} match your request. Which one are you looking for?`;

            logger.info({
              Module: 'customerDetails',
              Message: errorMessage,
              ObjectMsg: {
                searchValue,
                matchCount: result.length,
                matches: result.map((r) => ({ Id: r.Id, Name: r.Name })),
                executionTime: Date.now() - startTime,
              },
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      error: errorMessage,
                      searchValue,
                      matches: result.map((r) => ({ Id: r.Id, Name: r.Name })),
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

          // Single match found - success case
          const customer = result[0];
          const customerResult = {
            customer: {
              Id: Number(customer.Id),
              Name: String(customer.Name),
            },
          };

          logger.info({
            Module: 'customerDetails',
            Message: 'Successfully found customer',
            ObjectMsg: {
              searchValue,
              foundCustomer: customerResult.customer,
              executionTime: Date.now() - startTime,
            },
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(customerResult, null, 2),
              },
            ],
            structuredContent: customerResult,
          };
        } catch (error) {
          const totalDuration = Date.now() - startTime;

          logger.error({
            Module: 'customerDetails',
            Message: 'Error occurred during customerDetails execution',
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
                    message: 'Failed to search for customer details',
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

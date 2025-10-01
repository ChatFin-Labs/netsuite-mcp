#!/usr/bin/env node

// Load environment variables FIRST, before any other imports
import dotenv from "dotenv";
dotenv.config();

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServerFactory } from "./shared/mcp-server-factory";
import { logger } from "./utils/logger";

// Load and validate environment variables
const envConfig = McpServerFactory.loadEnvironment();
McpServerFactory.validateEnvironment(envConfig, logger);
McpServerFactory.logEnvironmentConfig(envConfig, logger);

async function main() {
  // Create the MCP server
  const server = McpServerFactory.createServer();

  // Create STDIO transport
  const transport = new StdioServerTransport();

  // Connect the server to the transport
  await server.connect(transport);

  // Log to stderr (so it doesn't interfere with STDIO communication)
  logger.error({
    Module: "stdio-server",
    Message: "NetSuite MCP Server started in STDIO mode",
  });
}

// Setup graceful shutdown
McpServerFactory.setupGracefulShutdown(logger);

// Start the server
main().catch((error) => {
  logger.error({
    Module: "stdio-server",
    Message: "Failed to start MCP server",
    ObjectMsg: { error: error instanceof Error ? error.message : String(error) },
  });
  process.exit(1);
});

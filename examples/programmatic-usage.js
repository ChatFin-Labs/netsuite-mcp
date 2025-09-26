#!/usr/bin/env node

/**
 * Example usage of @chatfinai/netsuite-mcp
 * 
 * This example shows how to use the NetSuite MCP server programmatically
 * in your own Node.js application.
 */

const { McpServerFactory } = require('@chatfinai/netsuite-mcp');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
require('dotenv').config();

async function main() {
  try {
    // Load and validate environment configuration
    const envConfig = McpServerFactory.loadEnvironment();
    McpServerFactory.validateEnvironment(envConfig, console);

    // Create the MCP server
    const server = McpServerFactory.createServer();

    // Create transport (you can use STDIO or HTTP transport)
    const transport = new StdioServerTransport();
    
    // Connect the server to the transport
    await server.connect(transport);

    console.error('NetSuite MCP Server started successfully!');
    console.error('Available tools:', await server.listTools());

  } catch (error) {
    console.error('Failed to start NetSuite MCP Server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('Shutting down NetSuite MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Shutting down NetSuite MCP Server...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
# @chatfinai/netsuite-mcp

[![npm version](https://badge.fury.io/js/@chatfinai%2Fnetsuite-mcp.svg)](https://badge.fury.io/js/@chatfinai%2Fnetsuite-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive Model Context Protocol (MCP) server for accessing NetSuite data through RESTlets and SuiteQL queries. This server provides extensive NetSuite integration capabilities with support for financial data, customer information, transactions, and more.

## Features

- **Comprehensive NetSuite Integration**: Access accounts, customers, vendors, transactions, and financial data
- **Dual Server Modes**: HTTP server for web clients and STDIO server for MCP clients
- **Advanced Logging**: File-based logging with rotation and configurable levels  
- **Development Tools**: Ngrok integration for tunneling and MCP Inspector support
- **Security**: CORS configuration and environment-based access controls
- **Error Handling**: Robust error handling with structured logging
- **Easy Installation**: Available as an npm package with TypeScript support

## System Requirements

- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0 or **yarn**: >= 1.22.0
- **NetSuite**: Active account with REST API and OAuth 2.0 access

## Key Dependencies

- **[@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)**: MCP protocol implementation
- **[express](https://expressjs.com/)**: Web server framework
- **[axios](https://axios-http.com/)**: HTTP client for NetSuite API
- **[winston](https://github.com/winstonjs/winston)**: Logging with file rotation
- **[typescript](https://www.typescriptlang.org/)**: TypeScript compiler and tooling

## Prerequisites

### NetSuite Setup Requirements

1. **Enable SuiteQL**: Ensure SuiteQL is enabled in your NetSuite account
2. **Integration Record**: Create an Integration record in NetSuite with appropriate scopes
3. **Custom RESTlet**: Deploy the custom search RESTlet for advanced queries
4. **Access Token**: Generate OAuth 2.0 access tokens for your integration
5. **User Permissions**: Ensure the token user has appropriate permissions for:
   - Accounts (View/List)
   - Customers, Vendors, Items (View/List)
   - Transactions (View/List)
   - SuiteQL queries
   - REST Web Services
   - RESTlets

## Configuration

### Environment Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Configure required NetSuite settings:
   ```bash
   # Required
   NETSUITE_REST_URL=https://your-account-id.suitetalk.api.netsuite.com/services/rest/
   NETSUITE_SEARCH_REST_LET=https://your-account-id.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_cf_search_rl&deploy=customdeploy_cf_search_rl
   NETSUITE_ACCESS_TOKEN=your_jwt_access_token_here
   
   # Optional
   PORT=3000
   LOG_LEVEL=info
   LOG_TO_FILE=true
   ```

See [`.env.example`](.env.example) for all available configuration options.

## Installation

Install the package from npm:

```bash
npm install @chatfinai/netsuite-mcp
```

Or using yarn:

```bash
yarn add @chatfinai/netsuite-mcp
```

## Usage

### Option 1: Using as a Global Package

Install globally and use the command line tools:

```bash
# Install globally
npm install -g @chatfinai/netsuite-mcp

# Or with yarn
yarn global add @chatfinai/netsuite-mcp

# Run HTTP server
netsuite-mcp-http

# Run STDIO server  
netsuite-mcp-stdio
```

### Option 2: Using in Your Project

```bash
# Install locally
npm install @chatfinai/netsuite-mcp

# Add to your package.json scripts:
# "start:netsuite-http": "netsuite-mcp-http",
# "start:netsuite-stdio": "netsuite-mcp-stdio"

# Then run:
npm run start:netsuite-http
# or
npm run start:netsuite-stdio
```

### Option 3: Using with MCP Clients (Claude Desktop, etc.)

Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "netsuite": {
      "command": "netsuite-mcp-stdio",
      "env": {
        "NETSUITE_REST_URL": "https://your-account-id.suitetalk.api.netsuite.com/services/rest/",
        "NETSUITE_SEARCH_REST_LET": "https://your-account-id.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_cf_search_rl&deploy=customdeploy_cf_search_rl",
        "NETSUITE_ACCESS_TOKEN": "your_jwt_access_token_here"
      }
    }
  }
}
```

See the [`examples/claude-desktop-config.json`](examples/claude-desktop-config.json) file for a complete configuration example.

### Option 4: Programmatic Usage

```typescript
import { McpServerFactory } from '@chatfinai/netsuite-mcp';

// Create and configure your MCP server
const server = McpServerFactory.createServer();
// ... configure as needed
```

**See more examples:**
- [Programmatic Usage Example](./examples/programmatic-usage.js)
- [Claude Desktop Configuration](./examples/claude-desktop-config.json)

### Development Setup

1. **Clone and install:**
   ```bash
   git clone https://github.com/ChatFinAI/netsuite-mcp.git
   cd netsuite-mcp
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your NetSuite configuration
   ```

3. **Build and run:**
   ```bash
   npm run build
   npm run start:http    # HTTP server
   npm run start:stdio   # STDIO server
   ```

#### Development Scripts

```bash
npm run dev          # HTTP server + ngrok tunnel
npm run build        # Compile TypeScript
npm run lint         # Code linting
npm run clean        # Clean build artifacts
npm run inspector    # MCP debugging tool
```

### Running the Server

#### HTTP Server Mode (Web Clients)
```bash
# Start HTTP server (default port 3000)
npm run start:http

# Start with development tunneling  
npm run dev
```

#### STDIO Server Mode (MCP Clients)
```bash
# Start STDIO server for MCP clients
npm run start:stdio

# Debug with MCP Inspector
npm run inspector
```

### Development Scripts

```bash
# Build and clean
npm run clean          # Clean dist and logs
npm run build          # Compile TypeScript
npm run lint           # Run ESLint

# Development
npm run dev            # Start HTTP server + ngrok tunnel
npm run ngrok          # Start ngrok tunnel only
npm run inspector      # Start MCP Inspector for debugging

# Process management  
npm run stop           # Stop all server processes
```

## Server Architecture

The application provides two server modes:

- **HTTP Server**: Express-based server for web clients with CORS support
- **STDIO Server**: Standard I/O server for MCP clients (Claude Desktop, etc.)

Both servers use the same core components for NetSuite integration and tool registration.

## Available Tools

### Account Management
- **`get-accounts`**: Retrieve chart of accounts with filtering, sorting, and pagination
- **`get-account-balance`**: Get account balances for specific periods
- **`get-accounting-periods`**: List all accounting periods
- **`get-subsidiaries`**: Get subsidiary information

### Customer & Vendor Management  
- **`get-customers`**: Retrieve customer information with contact details
- **`get-customer-details`**: Get detailed customer information
- **`get-vendors`**: List vendors with contact information

### Sales & Revenue
- **`get-invoices`**: Retrieve invoices with customer and amount details
- **`get-invoice-items`**: Get line items from invoices
- **`get-credit-memos`**: List credit memos
- **`get-payments`**: Get payment records
- **`get-items`**: Retrieve sellable items catalog

### Financial Transactions
- **`get-transactions`**: General transaction data
- **`get-bills`**: Vendor bills and bill payments  
- **`get-journals`**: Journal entries

### Organization Data
- **`get-departments`**: Department listings
- **`get-locations`**: Location information
- **`get-classes`**: Class information
- **`get-posting-period`**: Posting periods

### Query Features

All tools support:
- **Filtering**: Field-based filtering with operators
- **Sorting**: Multi-column sorting (ASC/DESC)
- **Pagination**: Limit and offset support
- **Count Mode**: Get record counts without data
- **Field Selection**: Choose specific fields to return

### Example Usage

```json
{
  "name": "get-accounts",
  "arguments": {
    "Filters": [
      {"Field": "Type", "Operator": "anyof", "Values": ["Income", "Expense"]}
    ],
    "Sort": [
      {"Column": "AccountNumber", "Order": "ASC"}
    ],
    "Limit": 50,
    "Offset": 0,
    "CountOnly": false
  }
}
```

## Development Features

### Ngrok Integration

The project includes comprehensive ngrok configuration for development:

```bash
# Start both server and tunnel
yarn dev

# Start tunnel only  
yarn ngrok
```

**Ngrok Features:**
- Debug-level logging to `logs/ngrok.log` (JSON format)
- Web interface at http://localhost:4040 for request inspection
- Reserved domain support
- Automatic tunnel setup with authentication

### MCP Inspector

Debug your MCP server with the official inspector:

```bash
yarn inspector
```

This provides a web interface for testing MCP tools and debugging server behavior.

### Logging System

**File Logging** (when `LOG_TO_FILE=true`):
- Logs written to `logs/app.log`
- Automatic log rotation
- Configurable file size and retention
- JSON format for structured logging

**Console Logging** (when `LOG_TO_FILE=false`):
- Colorized console output
- JSON format with color highlighting

**Configuration:**
```bash
LOG_LEVEL=info          # error, warn, info, debug
LOG_TO_FILE=true        # Enable file logging
LOG_MAX_SIZE=10m        # Max file size before rotation  
LOG_MAX_FILES=5         # Number of files to retain
```

### Project Files
- [`.env.example`](.env.example) - Configuration template
- [`examples/claude-desktop-config.json`](examples/claude-desktop-config.json) - Claude Desktop setup
- [`examples/programmatic-usage.js`](examples/programmatic-usage.js) - API usage example

## Troubleshooting

### Authentication Issues

**401 Authentication Error:**
- Verify `NETSUITE_ACCESS_TOKEN` is set and valid
- Check NetSuite integration record is active  
- Ensure tokens are not expired
- Verify user permissions for REST Web Services

**403 Forbidden Error:**
- Check user role permissions for specific record types
- Ensure SuiteQL feature is enabled in NetSuite
- Verify access to required record types (Accounts, Customers, etc.)

### Configuration Issues

**Missing Environment Variables:**
- Copy `.env.example` to `.env`
- Fill in all required NetSuite configuration
- Check console output for specific missing variables

**RESTlet Connection Issues:**
- Verify `NETSUITE_SEARCH_REST_LET` URL is correct
- Ensure custom search RESTlet is deployed
- Check RESTlet script and deployment IDs

### Network & Connectivity

**Connection Timeout:**
- Confirm `NETSUITE_REST_URL` matches your account
- Check firewall settings
- Verify NetSuite account is accessible

**CORS Issues (HTTP Mode):**
- Configure `ALLOWED_ORIGINS` for production
- Check browser developer tools for CORS errors

### Development Issues

**Build Failures:**
- Run `yarn clean` then `yarn build`
- Check TypeScript errors in console
- Verify all dependencies are installed

**Ngrok Tunnel Issues:**
- Verify `NGROK_AUTH_TOKEN` and `NGROK_DOMAIN` are set
- Check ngrok account has available tunnels
- Review `logs/ngrok.log` for connection details

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Maintainers

- ChatFinAI Open Source Team (<support@chatfin.ai>)

## Support

For questions or support, open an issue on GitHub or contact us at <support@chatfin.ai>.
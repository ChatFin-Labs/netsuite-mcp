import dotenv from 'dotenv';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ILogger } from '../Models/General';
import { logger } from '../utils/logger';
import { GetAccountBalance } from "../tools/accounts/GetAccountBalance";
import { GetAccountingPeriods } from "../tools/accounts/GetAccountingPeriods";
import { GetSubsidiaries } from "../tools/accounts/GetSubsidiaries";
import { GetVendors } from "../tools/vendors/GetVendors";
import { GetCustomers } from "../tools/customers/GetCustomers";
import { GetDepartments } from "../tools/sales/GetDepartments";
import { GetLocations } from "../tools/sales/GetLocations";
import { GetItems } from "../tools/sales/GetItems";
import { GetInvoices } from "../tools/sales/GetInvoices";
import { GetPayments } from "../tools/sales/GetPayments";
import { GetCreditMemos } from "../tools/sales/GetCreditMemos";
import { GetInvoiceItems } from "../tools/sales/GetInvoiceItems";
import { GetPostingPeriod } from "../tools/sales/GetPostingPeriod";
import { GetTransactions } from "../tools/transactions/GetTransactions";
import { GetBills } from "../tools/transactions/GetBills";
import { GetJournals } from "../tools/transactions/GetJournals";
import { GetCustomerDetails } from "../tools/sales/GetCustomerDetails";
import { GetClasses } from "../tools/sales/GetClasses";
import { GetAccounts } from '../tools/accounts/GetAccounts';

export interface EnvironmentConfig {
  NETSUITE_REST_URL?: string;
  NETSUITE_ACCESS_TOKEN?: string;
  NETSUITE_ACCOUNT_TYPES?: string;
  LOG_LEVEL?: string;
  LOG_TO_FILE?: string;
  LOG_MAX_SIZE?: string;
  LOG_MAX_FILES?: string;
  PORT?: string;
  NGROK_DOMAIN?: string;
  ALLOWED_HOSTS?: string;
}

export interface ServerConfig {
  name: string;
  version: string;
}

export class McpServerFactory {
  private static readonly DEFAULT_CONFIG: ServerConfig = {
    name: 'netsuite-mcp-server',
    version: '1.0.0',
  };

  /**
   * Register all tools with the MCP server
   * @param server The MCP server instance to register tools with
   */
  static registerTools(server: McpServer): void {
    // Register tools
    new GetAccounts().register(server);
    new GetAccountBalance().register(server);
    new GetSubsidiaries().register(server);
    new GetAccountingPeriods().register(server);
    new GetVendors().register(server);
    new GetCustomers().register(server);
    new GetCustomerDetails().register(server);
    new GetClasses().register(server);
    new GetDepartments().register(server);
    new GetLocations().register(server);
    new GetItems().register(server);
    new GetInvoices().register(server);
    new GetPayments().register(server);
    new GetCreditMemos().register(server);
    new GetInvoiceItems().register(server);
    new GetPostingPeriod().register(server);
    new GetTransactions().register(server);
    new GetBills().register(server);
    new GetJournals().register(server);
  }


  /**
   * Load environment variables with validation
   */
  static loadEnvironment(explicitPath?: string): EnvironmentConfig {
    let result;

    if (explicitPath) {
      const envPath = path.resolve(process.cwd(), explicitPath);
      result = dotenv.config({ path: envPath });

      if (result.error) {
        logger.error({
          Module: 'environment',
          Message: `Failed to load environment variables from ${envPath}: ${result.error.message}`,
        });
      } else {
        logger.error({
          Module: 'environment',
          Message: `Environment variables loaded from ${envPath}`,
        });
      }
    } else {
      result = dotenv.config();
    }

    return process.env as EnvironmentConfig;
  }

  /**
   * Validate required environment variables
   */
  static validateEnvironment(config: EnvironmentConfig, logger: ILogger): boolean {
    const requiredEnvVars = ['NETSUITE_REST_URL', 'NETSUITE_ACCESS_TOKEN'];

    const missingEnvVars = requiredEnvVars.filter(
      (varName) => !config[varName as keyof EnvironmentConfig]
    );

    if (missingEnvVars.length > 0) {
      const message = `Missing required environment variables: ${missingEnvVars.join(', ')}`;
      logger.error({
        Module: 'environment',
        Message: message,
      });

      return false;
    }

    // Validate URL format
    if (config.NETSUITE_REST_URL) {
      try {
        new URL(config.NETSUITE_REST_URL);
      } catch {
        const message = 'NETSUITE_REST_URL is not a valid URL format';

        logger.error({
          Module: 'environment',
          Message: message,
          ObjectMsg: { url: config.NETSUITE_REST_URL },
        });

        return false;
      }
    }

    // Validate token format (basic check for JWT-like structure)
    if (config.NETSUITE_ACCESS_TOKEN && !config.NETSUITE_ACCESS_TOKEN.includes('.')) {
      const message = 'NETSUITE_ACCESS_TOKEN does not appear to be a valid JWT token';

      logger.error({
        Module: 'environment',
        Message: message,
      });

      return false;
    }

    // Validate numeric values
    if (config.PORT && isNaN(parseInt(config.PORT))) {
      const message = 'PORT must be a valid number';

      logger.error({
        Module: 'environment',
        Message: message,
      });

      return false;
    }

    logger.info({
      Module: 'environment',
      Message: 'All required environment variables are present and valid',
    });

    return true;
  }

  /**
   * Log environment configuration (without sensitive data)
   */
  static logEnvironmentConfig(config: EnvironmentConfig, logger: ILogger): void {
    const envConfig = {
      NETSUITE_REST_URL: config.NETSUITE_REST_URL ? '✓ Set' : '✗ Missing',
      NETSUITE_ACCESS_TOKEN: config.NETSUITE_ACCESS_TOKEN ? '✓ Set' : '✗ Missing',
      NETSUITE_ACCOUNT_TYPES: config.NETSUITE_ACCOUNT_TYPES ? '✓ Set' : '- Optional',
      LOG_LEVEL: config.LOG_LEVEL || 'info (default)',
      LOG_TO_FILE: config.LOG_TO_FILE || 'false (default)',
      PORT: config.PORT || '3000 (default)',
      NGROK_DOMAIN: config.NGROK_DOMAIN || 'Not Set',
      ALLOWED_HOSTS: config.ALLOWED_HOSTS || 'Not Set',
    };

    logger.info({
      Module: 'environment',
      Message: 'Environment configuration',
      ObjectMsg: envConfig,
    });
  }

  /**
   * Create and configure an MCP server with all tools and resources
   */
  static createServer(config: ServerConfig = McpServerFactory.DEFAULT_CONFIG): McpServer {
    const server = new McpServer({
      name: config.name,
      version: config.version,
    });

    // Register tools and log results
    this.registerTools(server);

    // Add a netsuite greeting resource
    server.registerResource(
      'greeting',
      'greeting://welcome',
      {
        title: 'Welcome Message',
        description: 'A netsuite welcome message for the MCP server',
        mimeType: 'text/plain',
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            text: 'Welcome to the NetSuite MCP Server! This server provides an API call tool that waits 5 seconds and fetches example JSON data.',
          },
        ],
      })
    );

    return server;
  }

  /**
   * Setup graceful shutdown handlers
   */
  static setupGracefulShutdown(logger: ILogger, onShutdown?: () => void): void {
    const handleShutdown = (signal: string) => {
      const message = `${signal} received, shutting down gracefully`;

      logger.info({
        Module: 'app',
        Message: message,
      });

      if (onShutdown) {
        onShutdown();
      }

      process.exit(0);
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  }
}

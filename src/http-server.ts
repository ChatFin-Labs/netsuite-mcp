#!/usr/bin/env node

// Load environment variables FIRST, before any other imports
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "./utils/logger";
import { McpServerFactory } from "./shared/mcp-server-factory";

// Load and validate environment variables
const envConfig = McpServerFactory.loadEnvironment();
McpServerFactory.validateEnvironment(envConfig, logger);
McpServerFactory.logEnvironmentConfig(envConfig, logger);

class NetSuiteMcpServer {
  private app: express.Application;
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } =
    {};
  private sessionTimers: { [sessionId: string]: ReturnType<typeof setTimeout> } = {};
  private readonly port: number;
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.app = express();
    this.port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSessionCleanup();
  }

  private setupMiddleware(): void {
    // CORS configuration for browser-based clients
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? (process.env.ALLOWED_ORIGINS?.split(',') || ['https://claude.ai'])
      : "*";
    
    this.app.use(
      cors({
        origin: allowedOrigins,
        exposedHeaders: ["Mcp-Session-Id"],
        allowedHeaders: ["Content-Type", "mcp-session-id", "Authorization"],
        methods: ["GET", "POST", "DELETE", "OPTIONS"],
        credentials: true,
      })
    );

    this.app.use(express.json());

    // Request logging
    this.app.use((req, res, next) => {
      logger.info({
        Module: "http-request",
        Message: "Incoming request",
        ObjectMsg: {
          method: req.method,
          url: req.originalUrl,
          headers: req.headers,
          body: req.body,
        },
      });
      next();
    });
  }

  private createMcpServer(): McpServer {
    const server = McpServerFactory.createServer();

    logger.info({
      Module: 'MCP_SERVER',
      Message: 'MCP Server configured with tools and resources'
    });
    return server;
  }

  private setupSessionCleanup(): void {
    // Clean up abandoned sessions every 5 minutes
    setInterval(() => {
      Object.keys(this.transports).forEach(sessionId => {
        // Check if we have a timer for this session, if not it may be abandoned
        if (!this.sessionTimers[sessionId]) {
          logger.info({
            Module: "session-cleanup",
            Message: `Found session without timer, cleaning up: ${sessionId}`,
          });
          this.cleanupSession(sessionId);
        }
      });
    }, 5 * 60 * 1000);
  }

  private resetSessionTimer(sessionId: string): void {
    // Clear existing timer
    if (this.sessionTimers[sessionId]) {
      clearTimeout(this.sessionTimers[sessionId]);
    }

    // Set new timer
    this.sessionTimers[sessionId] = setTimeout(() => {
      this.cleanupSession(sessionId);
    }, this.SESSION_TIMEOUT);
  }

  private cleanupSession(sessionId: string): void {
    logger.info({
      Module: "session-cleanup",
      Message: `Cleaning up inactive session: ${sessionId}`,
    });

    // Close transport if it exists
    if (this.transports[sessionId]) {
      try {
        // The transport should handle its own cleanup
        delete this.transports[sessionId];
      } catch (error) {
        logger.error({
          Module: "session-cleanup",
          Message: "Error cleaning up transport",
          ObjectMsg: { sessionId, error: error instanceof Error ? error.message : String(error) }
        });
      }
    }

    // Clear timer
    if (this.sessionTimers[sessionId]) {
      clearTimeout(this.sessionTimers[sessionId]);
      delete this.sessionTimers[sessionId];
    }
  }

  private setupRoutes(): void {
    // OAuth Discovery endpoints for Claude compatibility
    this.app.get("/.well-known/oauth-authorization-server", (_req, res) => {
      res.json({
        issuer: `http://localhost:${this.port}`,
        authorization_endpoint: `http://localhost:${this.port}/authorize`,
        token_endpoint: `http://localhost:${this.port}/token`,
        registration_endpoint: `http://localhost:${this.port}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
      });
    });

    // MCP-specific OAuth discovery endpoint
    this.app.get("/.well-known/oauth-authorization-server/mcp", (_req, res) => {
      res.json({
        issuer: `http://localhost:${this.port}`,
        authorization_endpoint: `http://localhost:${this.port}/authorize`,
        token_endpoint: `http://localhost:${this.port}/token`,
        registration_endpoint: `http://localhost:${this.port}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
        scopes_supported: ["mcp:tools", "mcp:resources"],
      });
    });

    // OAuth Protected Resource metadata
    this.app.get("/.well-known/oauth-protected-resource", (_req, res) => {
      res.json({
        resource: `http://localhost:${this.port}/mcp`,
        authorization_servers: [`http://localhost:${this.port}`],
        scopes_supported: ["mcp:tools", "mcp:resources"],
        resource_name: "NetSuite MCP Server",
        resource_documentation:
          "A netsuite MCP server with delayed API call tool",
      });
    });

    // OAuth client registration endpoint (simplified implementation)
    this.app.post("/register", (req, res) => {
      const {
        redirect_uris,
        token_endpoint_auth_method = "client_secret_post",
      } = req.body;

      if (
        !redirect_uris ||
        !Array.isArray(redirect_uris) ||
        redirect_uris.length === 0
      ) {
        return res.status(400).json({
          error: "invalid_client_metadata",
          error_description:
            "redirect_uris is required and must be a non-empty array",
        });
      }

      // Generate client credentials
      const clientId = `client_${randomUUID()}`;
      const clientSecret =
        token_endpoint_auth_method === "none"
          ? undefined
          : `secret_${randomUUID()}`;

      const response: {
        client_id: string;
        redirect_uris: string[];
        token_endpoint_auth_method: string;
        client_id_issued_at: number;
        client_secret?: string;
        client_secret_expires_at?: number;
      } = {
        client_id: clientId,
        redirect_uris,
        token_endpoint_auth_method,
        client_id_issued_at: Math.floor(Date.now() / 1000),
      };

      if (clientSecret) {
        response.client_secret = clientSecret;
        response.client_secret_expires_at = 0; // Never expires for demo
      }

      // logger.info(`OAuth client registered: ${clientId}`);
      res.status(201).json(response);
    });

    // OAuth authorization endpoint (simplified implementation)
    this.app.get("/authorize", (req, res) => {
      const { client_id, redirect_uri, code_challenge, state } = req.query;

      if (!client_id || !redirect_uri || !code_challenge) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing required parameters",
        });
      }

      // Generate authorization code
      const code = `auth_${randomUUID()}`;

      // Redirect back with code
      const redirectUrl = new URL(redirect_uri as string);
      redirectUrl.searchParams.set("code", code);
      if (state) {
        redirectUrl.searchParams.set("state", state as string);
      }

      // logger.info(`OAuth authorization granted for client: ${client_id}`);
      res.redirect(redirectUrl.toString());
    });

    // OAuth token endpoint (simplified implementation)
    this.app.post("/token", (req, res) => {
      const { grant_type, code, client_id, code_verifier } = req.body;

      if (grant_type !== "authorization_code") {
        return res.status(400).json({
          error: "unsupported_grant_type",
          error_description: "Only authorization_code grant type is supported",
        });
      }

      if (!code || !client_id || !code_verifier) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing required parameters",
        });
      }

      // Generate tokens
      const accessToken = `access_${randomUUID()}`;
      const refreshToken = `refresh_${randomUUID()}`;

      // logger.info(`OAuth tokens issued for client: ${client_id}`);
      res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: refreshToken,
        scope: "mcp:tools mcp:resources",
      });
    });

    // Health check endpoint
    this.app.get("/health", (_req, res) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        server: "netsuite-mcp-server",
        version: "1.0.0",
      });
    });

    // Handle POST requests for client-to-server communication
    this.app.post("/mcp", async (req, res) => {
      try {
        // Check for existing session ID
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && this.transports[sessionId]) {
          // Reuse existing transport
          transport = this.transports[sessionId];
          // Reset session timer for active sessions
          this.resetSessionTimer(sessionId);
          // logger.info(`Reusing existing transport for session: ${sessionId}`);
        } else if (!sessionId && isInitializeRequest(req.body)) {
          // New initialization request
          // logger.info('Creating new MCP transport for initialization request');

          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId: string) => {
              logger.info({
                Module: "mcp-session",
                Message: `MCP session initialized: ${sessionId}`,
              });
              // Store the transport by session ID
              this.transports[sessionId] = transport;
              // Start session timer
              this.resetSessionTimer(sessionId);
            },
            // Enable DNS rebinding protection for security but allow ngrok domain
            enableDnsRebindingProtection: true,
            allowedHosts: [
              "127.0.0.1",
              "localhost",
              "localhost:3000",
              ...(process.env.ALLOWED_HOSTS?.split(",") || []),
            ],
          });

          // Clean up transport when closed
          transport.onclose = () => {
            if (transport.sessionId) {
              logger.info({
                Module: "mcp-session",
                Message: `MCP session closed: ${transport.sessionId}`,
              });

              this.cleanupSession(transport.sessionId);
            }
          };

          const s = this.createMcpServer();

          // Connect to the MCP server
          await s.connect(transport);
        } else {
          // Invalid request

          logger.error({
            Module: "mcp-request-handler",
            Message: "Bad Request: No valid session ID provided",
            ObjectMsg: {
              requestBody: req.body,
              sessionId: req.headers["mcp-session-id"],
            },
          });

          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: No valid session ID provided",
            },
            id: null,
          });
          return;
        }

        // Handle the request
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        logger.error({
          Module: "mcp-request-handler",
          Message: "Error handling MCP request",
          ObjectMsg: {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            requestBody: req.body,
            sessionId: req.headers["mcp-session-id"],
          },
        });

        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    });

    // Reusable handler for GET and DELETE requests
    const handleSessionRequest = async (
      req: express.Request,
      res: express.Response
    ) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId || !this.transports[sessionId]) {
        // logger.warn(`Invalid or missing session ID: ${sessionId}`);
        res.status(400).send("Invalid or missing session ID");
        return;
      }

      const transport = this.transports[sessionId];
      await transport.handleRequest(req, res);
    };

    // Handle GET requests for server-to-client notifications via SSE
    this.app.get("/mcp", handleSessionRequest);

    // Handle DELETE requests for session termination
    this.app.delete("/mcp", handleSessionRequest);

    // Catch-all route for undefined endpoints
    this.app.use("*", (req, res) => {
      // logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
      res.status(404).json({
        error: "Route not found",
        path: req.originalUrl,
        method: req.method,
      });
    });
  }

  public start(): void {
    this.app.listen(this.port, () => {
      logger.info({
        Module: "app",
        Message: "NetSuite MCP Server started",
        ObjectMsg: {
          port: this.port,
          healthCheckUrl: `http://localhost:${this.port}/health`,
          mcpEndpoint: `http://localhost:${this.port}/mcp`,
          ngrokDomain: process.env.NGROK_DOMAIN || "Not Set",
          externalMcpEndpoint: process.env.NGROK_DOMAIN
            ? `https://${process.env.NGROK_DOMAIN}/mcp`
            : "Ngrok domain not configured",
        },
      });
    });

    // Setup graceful shutdown
    McpServerFactory.setupGracefulShutdown(logger);
  }
}

// Start the server
const server = new NetSuiteMcpServer();
server.start();

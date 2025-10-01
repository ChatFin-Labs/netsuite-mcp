import lodash from "lodash";
import { GenDictionary, ILog } from "../Models/General";
import winston from "winston";
import { DateUtil } from "./date";
import { localstorage } from "./localstorage";
import path from "path";
import fs from "fs";

winston.addColors({
  error: "red",
  info: "white",
  debug: "green",
});

// Helper function to parse size strings like "10m", "5mb", etc.
function parseSize(sizeStr: string): number {
  const match = sizeStr.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([kmg]?b?)$/);
  if (!match) return 10485760; // Default 10MB

  const [, num, unit] = match;
  const size = parseFloat(num);

  switch (unit) {
    case "k":
    case "kb":
      return size * 1024;
    case "m":
    case "mb":
      return size * 1024 * 1024;
    case "g":
    case "gb":
      return size * 1024 * 1024 * 1024;
    default:
      return size;
  }
}

// Lazy initialization of Winston logger to ensure environment variables are loaded
let winstonLogger: winston.Logger | null = null;

function getLogger(): winston.Logger {
  if (!winstonLogger) {
    const logLevel = process.env.LOG_LEVEL || "info";

    // Ensure logs directory exists
    const logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const transports: winston.transport[] = [];

    // Log to file when LOG_TO_FILE is true, otherwise log to console
    if ((process.env.LOG_TO_FILE ?? "").toString() === "true") {
      const logFilePath = path.join(logDir, "app.log");
      transports.push(
        new winston.transports.File({
          filename: logFilePath,
          level: logLevel,
          format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
          handleExceptions: true,
          handleRejections: true,
          maxsize: process.env.LOG_MAX_SIZE ? parseSize(process.env.LOG_MAX_SIZE) : 10485760, // 10MB default
          maxFiles: process.env.LOG_MAX_FILES ? parseInt(process.env.LOG_MAX_FILES) : 5,
        })
      );
    } else {
      // Default to console logging when LOG_TO_FILE is false or not set
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.json(),
            winston.format.colorize({ all: true })
          ),
        })
      );
    }

    winstonLogger = winston.createLogger({
      level: logLevel,
      format: winston.format.json(),
      transports,
    });

    // Test log to verify file logging is working
    if ((process.env.LOG_TO_FILE ?? "") === "true") {
      winstonLogger.info("Logger initialized - file logging enabled", {
        App: "ChatFin-NetSuite-MCP",
        Module: "logger-init",
        timestamp: new Date().toISOString(),
        logLevel: logLevel,
        logToFile: process.env.LOG_TO_FILE,
      });
    }
  }

  return winstonLogger;
}

function logAny(level: "info" | "error" | "debug", obj: ILog): void {
  const logObj = lodash.cloneDeep(obj) as unknown as GenDictionary;
  logObj.App = logObj.App ?? "ChatFin-NetSuite-MCP";
  logObj.t = logObj.t ?? DateUtil.getISO();
  const message = logObj.Message || "";
  delete logObj.Message;
  if (!logObj.CorrelationId) logObj.CorrelationId = localstorage.get<string>("CorrelationId");
  getLogger().log(level, { message, ...logObj });
}

function info(obj: ILog): void {
  logAny("info", obj);
}

function error(obj: ILog): void {
  logAny("error", obj);
}

function debug(obj: ILog): void {
  logAny("debug", obj);
}

export const logger = {
  info,
  error,
  debug,
};

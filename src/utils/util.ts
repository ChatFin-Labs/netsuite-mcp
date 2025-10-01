import { createHash, createHmac } from "crypto";
import * as fs from "fs";
import { GenDictionary } from "../Models/General";
import path from "path";
import { localstorage } from "./localstorage";
import { v4 as uuidv4 } from "uuid";

const getUUID = (): string => {
  return uuidv4();
};

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

const genericErr = (): string => {
  const correlationId = localstorage.get<string>("CorrelationId");
  return `There was an error while processing your request (Id:${correlationId}).`;
};

const isValidforVar = (name: string): boolean => {
  const pattern: RegExp = /^[a-zA-Z_][a-zA-Z0-9_]+$/;
  return pattern.test(name);
};

const hasValidVar = (content: string): boolean => {
  const pattern: RegExp = /[a-zA-Z_][a-zA-Z0-9_]+/;
  return pattern.test(content);
};

function arrayHas<T extends Record<string, unknown>>(
  array: T[],
  prop: keyof T,
  value: unknown
): boolean {
  return array.some((item) => item[prop] === value);
}

const isJSONString = (str: string): boolean => {
  try {
    const o = JSON.parse(str);
    if (o && typeof o === "object") {
      return true;
    }
  } catch {
    /* empty */
  }
  return false;
};

const hash = (str: string, key?: string): string => {
  const algo = "sha256";
  const hasher = key ? createHmac(algo, key) : createHash(algo);
  return hasher.update(str).digest("hex").toString();
};

const sanitizeFileName = (fileName: string): boolean => {
  const sanitizeFileNameRegex = /^[^\\/:*?"<>|]+$/;
  return sanitizeFileNameRegex.test(fileName);
};

const getFolderPath = (userId: number, fileName?: string, subFolder?: string): string => {
  // Base user folder path
  let baseFolderPath = path.join("UserFiles", `User_${userId}`);

  if (subFolder) baseFolderPath = path.join(baseFolderPath, subFolder);

  // Ensure the base user folder exists
  if (!fs.existsSync(baseFolderPath)) {
    fs.mkdirSync(baseFolderPath, { recursive: true });
  }

  if (fileName) {
    if (!sanitizeFileName(fileName)) throw new Error("Invalid file name");

    const fullFilePath = path.join(baseFolderPath, fileName);

    // Check if the last part of filePath is a file
    const isFile = path.extname(fullFilePath) !== "";

    // If it's a file, only create folder until parent dir
    const directoryPath = isFile ? path.dirname(fullFilePath) : fullFilePath;
    // check if directory path exists, if not create
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }

    return fullFilePath;
  }

  return baseFolderPath;
};

function toPromise<T>(value: T | Promise<T>): Promise<T> {
  if (value instanceof Promise) {
    return value;
  } else {
    return Promise.resolve(value);
  }
}

function getDifferences(arr: number[]): number[] {
  if (arr.length < 2) {
    throw new Error("Array must contain at least two elements");
  }

  const differences: number[] = [];
  for (let i = 1; i < arr.length; i++) {
    differences.push(Math.abs(arr[i] - arr[i - 1]));
  }
  return differences;
}

function getMaxOccurredElement<T>(arr: T[]): T | null {
  if (arr.length === 0) {
    return null;
  }

  const occurrenceMap = new Map<T, number>();
  let maxElement: T | null = null;
  let maxCount = 0;

  for (const element of arr) {
    const count = (occurrenceMap.get(element) || 0) + 1;
    occurrenceMap.set(element, count);

    if (count > maxCount) {
      maxCount = count;
      maxElement = element;
    }
  }

  return maxElement;
}

const formatSize = (size: number): string => {
  const i = size === 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
  return +(size / Math.pow(1024, i)).toFixed(2) * 1 + " " + ["B", "KB", "MB", "GB", "TB"][i];
};

const trim = (matcher: "Execute" | "Respond" | "UserErr" | "AIErr", input: string): string => {
  return input.replace(matcher + ":", "").trim();
};

const escapeRegExp = function (text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

const extractHashtags = function (input: string): {
  hashtags: string[];
  cleanString: string;
} {
  // Regex to match hashtags
  const hashtagRegex = /#[\w]+/g;

  // Find all hashtags
  const hashtags = input.match(hashtagRegex) || [];

  // Remove hashtags from the original string
  const cleanString = input.replace(hashtagRegex, "").trim();

  return {
    hashtags,
    cleanString,
  };
};

const generateVarDeclarations = function (items: GenDictionary[]): string {
  return items
    .map((item) => {
      let formattedValue: string;

      switch (item.type) {
        case "number":
          formattedValue = String(item.value);
          break;
        case "multi-dropdown":
          formattedValue = JSON.stringify(item.value);
          break;
        case "dropdown":
        case "string":
        case "file":
        case "date":
        default:
          formattedValue = `"${item.value}"`;
          break;
      }

      return `var ${item.name} = ${formattedValue};`;
    })
    .join("\n");
};

export {
  getUUID,
  isDefined,
  genericErr,
  isValidforVar,
  hasValidVar,
  arrayHas,
  isJSONString,
  hash,
  getFolderPath,
  sanitizeFileName,
  toPromise,
  getDifferences,
  getMaxOccurredElement,
  formatSize,
  trim,
  escapeRegExp,
  extractHashtags,
  generateVarDeclarations,
};

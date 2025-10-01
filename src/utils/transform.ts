import {
  JsonConvert,
  JsonConverter,
  JsonCustomConvert,
  JsonObject,
  JsonProperty,
  PropertyMatchingRule,
} from "json2typescript";
import { DateUtil } from "./date";
import { Dictionary, GenDictionary } from "../Models/General";

export function transform(
  jsonArray: Record<string, unknown>[],
  propertyNames: Dictionary<{
    name?: string;
    type: "string" | "number" | "date" | "boolean";
    format?: string;
  }>
): Record<string, unknown>[] {
  return jsonArray.map((obj) => {
    const newObj: Record<string, unknown> = {};
    Object.keys(propertyNames).forEach((propertyName) => {
      const field = propertyNames[propertyName];
      const sourceKey = field.name ?? propertyName;

      const matchingKey = Object.keys(obj).find(
        (key) => key.toLowerCase() === sourceKey.toLowerCase()
      );
      if (matchingKey) {
        if (obj[matchingKey] !== null && obj[matchingKey] !== undefined) {
          if (propertyNames[propertyName].type === "number") {
            newObj[sourceKey] = parseFloat(String(obj[matchingKey]));
          } else if (
            propertyNames[propertyName].type === "date" &&
            propertyNames[propertyName].format !== undefined
          ) {
            newObj[sourceKey] = DateUtil.FormatToISO(
              String(obj[matchingKey]),
              propertyNames[propertyName].format || ""
            );
          } else if (propertyNames[propertyName].type === "boolean") {
            newObj[sourceKey] =
              obj[matchingKey].toString() === "1"
                ? true
                : obj[matchingKey].toString() === "0"
                  ? false
                  : obj[matchingKey];
          } else newObj[sourceKey] = obj[matchingKey];
        }
      }
    });
    return newObj;
  });
}
export function transformArray(
  jsonArray: unknown[][],
  propertyNames: Dictionary<{
    type: "string" | "number" | "date" | "boolean" | "id";
    format?: string;
  }>
): Record<string, unknown>[] {
  return jsonArray.map((obj) => {
    const newObj: Record<string, unknown> = {};
    Object.keys(propertyNames).forEach((propertyName, index) => {
      if (obj[index]) {
        if (propertyNames[propertyName].type === "number") {
          newObj[propertyName] = parseFloat(String(obj[index]));
        } else if (
          propertyNames[propertyName].type === "date" &&
          propertyNames[propertyName].format !== undefined
        ) {
          newObj[propertyName] = DateUtil.FormatToISO(
            String(obj[index]),
            propertyNames[propertyName].format || ""
          );
        } else newObj[propertyName] = obj[index];
      }
    });
    return newObj;
  });
}

export function transform2<T extends object>(
  obj: Array<GenDictionary>,
  type: {
    new (): T;
  }
): Array<T> {
  const jsonConvert = new JsonConvert();
  // jsonConvert.operationMode = OperationMode.LOGGING;
  jsonConvert.propertyMatchingRule = PropertyMatchingRule.CASE_INSENSITIVE;
  return jsonConvert.deserializeArray(obj, type);
}

@JsonConverter
export class NumberConverter implements JsonCustomConvert<number> {
  serialize(num: number): string {
    return num.toString();
  }

  deserialize(num: unknown): number {
    const convNum = parseFloat(String(num));
    if (convNum.toString() !== String(num)) throw new Error(`Cannot cast ${num} to Number`);
    return convNum;
  }
}

export const Obj = JsonObject;
export const Prop = JsonProperty;

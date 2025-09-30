import httpContext from 'express-http-context';
import { DateUtil } from './date';

const LocalStorageKeysAndDefaults: {
  CorrelationId: () => string;
  RequestStartTime: () => number;
  RequestRawBody: () => string;
} = {
  CorrelationId: () => '',
  RequestStartTime: () => DateUtil.getTimestamp(),
  RequestRawBody: () => '',
};

function set<T>(key: keyof typeof LocalStorageKeysAndDefaults, value: T): void {
  httpContext.set(key, value);
}

function get<T>(key: keyof typeof LocalStorageKeysAndDefaults): T {
  return httpContext.get(key) ?? LocalStorageKeysAndDefaults[key]();
}

export const localstorage = { get, set };

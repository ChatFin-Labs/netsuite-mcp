export type GenDictionary = { [key: string]: unknown };
export type Dictionary<T> = { [key: string]: T };
export type Part<T, K extends keyof T = never> = Partial<Omit<T, K>> & Required<Pick<T, K>>;
export interface ILog {
  CorrelationId?: string;
  Module: string;
  Message?: string;
  Stack?: string;
  Duration?: number;
  ObjectMsg?: GenDictionary;
  Critical?: boolean;
}

export interface ILogger {
  info(log: ILog): void;
  error(log: ILog): void;
  debug(log: ILog): void;
}

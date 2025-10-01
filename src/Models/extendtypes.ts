import { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";

export interface AxiosRequestConfigWithMetadata<T = unknown> extends InternalAxiosRequestConfig<T> {
  metadata?: {
    correlationId?: string;
    startTime?: number;
    authHeader?: string[];
  };
}

export interface AxiosResponseWithMetadata<T = unknown, D = unknown> extends AxiosResponse<T, D> {
  config: AxiosRequestConfigWithMetadata<D>;
}

export interface AxiosErrorWithMetadata<T = unknown, D = unknown> extends AxiosError<T, D> {
  config: AxiosRequestConfigWithMetadata<D>;
}

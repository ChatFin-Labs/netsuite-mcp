import axios, { AxiosRequestConfig, Method } from 'axios';
import { logger } from './logger';

export type HTTPRequest = {
  method?: Method;
  url: string;
  data?: unknown;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
};

export type NetSuiteHTTPRequest = Omit<HTTPRequest, 'headers'> & {
  headers?: Record<string, string>;
};



/**
 * Generic HTTP request utility using axios.
 * @param req HTTPRequest object
 */
export async function request<T = unknown>(req: HTTPRequest): Promise<T> {
  const requestStartTime = Date.now();
  logger.info({
    Module: 'http-request',
    Message: 'Starting HTTP request',
    ObjectMsg: {
      url: req.url,
      method: req.method,
      hasData: !!req.data,
      hasParams: !!req.params,
      hasCustomHeaders: !!(req.headers && Object.keys(req.headers).length > 0),
      startTime: new Date(requestStartTime).toISOString(),
    },
  });

  if (!req.method) {
    logger.error({
      Module: 'http-request',
      Message: 'Method is required but not provided',
      ObjectMsg: { requestObject: { ...req, data: req.data ? '[REDACTED]' : undefined } },
    });
    throw new Error('Method is required');
  }

  const baseUrl = '';

  try {

    const config: AxiosRequestConfig = {
      url: baseUrl ? `${baseUrl}${req.url}` : req.url,
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers || {}),
      },
      data: req.data,
      params: req.params,
    };

    logger.info({
      Module: 'http-request',
      Message: 'Request config prepared',
      ObjectMsg: {
        url: config.url,
        method: config.method,
        headers: { ...config.headers, Authorization: 'Bearer [REDACTED]' },
        params: config.params,
        hasData: !!config.data,
        dataSize: config.data ? JSON.stringify(config.data).length : 0,
      },
    });

    const requestStart = Date.now();
    const resp = await axios.request<T>(config);
    const requestDuration = Date.now() - requestStart;
    const totalDuration = Date.now() - requestStartTime;

    logger.info({
      Module: 'http-request',
      Message: 'Request successful',
      ObjectMsg: {
        status: resp.status,
        statusText: resp.statusText,
        requestDuration: requestDuration,
        totalDuration: totalDuration,
        responseSize: JSON.stringify(resp.data).length,
        contentType: resp.headers['content-type'],
      },
    });
    return resp.data;
  } catch (error) {
    const totalDuration = Date.now() - requestStartTime;
    logger.error({
      Module: 'http-request',
      Message: 'Request failed',
      ObjectMsg: {
        error: error instanceof Error ? error.message : String(error),
        url: req.url,
        method: req.method,
        totalDuration: totalDuration,
        isAxiosError: axios.isAxiosError(error),
        statusCode: axios.isAxiosError(error) ? error.response?.status : undefined,
        statusText: axios.isAxiosError(error) ? error.response?.statusText : undefined,
        responseData: axios.isAxiosError(error) ? error.response?.data : undefined,
      },
    });

    throw error;
  }
}
export async function get<T = unknown>(req: Omit<HTTPRequest, 'method'>): Promise<T> {
  return request<T>({ ...req, method: 'get' });
}

export async function post<T = unknown>(req: Omit<HTTPRequest, 'method'>): Promise<T> {
  return request<T>({ ...req, method: 'post' });
}

export async function put<T = unknown>(req: Omit<HTTPRequest, 'method'>): Promise<T> {
  return request<T>({ ...req, method: 'put' });
}

export async function patch<T = unknown>(req: Omit<HTTPRequest, 'method'>): Promise<T> {
  return request<T>({ ...req, method: 'patch' });
}

export async function del<T = unknown>(req: Omit<HTTPRequest, 'method'>): Promise<T> {
  return request<T>({ ...req, method: 'delete' });
}

/**
 * Make a NetSuite REST API request with automatic authentication
 * This function handles all authentication complexity internally
 */
export async function netsuiteRequest<T = unknown>(
  endpoint: string,
  method: Method = 'GET',
  data?: unknown,
  params?: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<T> {
  logger.info({
    Module: 'netsuite-request',
    Message: 'Starting NetSuite REST API request',
    ObjectMsg: {
      endpoint: endpoint,
      method: method,
      hasData: !!data,
      hasParams: !!params,
      hasCustomHeaders: !!headers,
      dataSize: data ? JSON.stringify(data).length : 0,
      paramCount: params ? Object.keys(params).length : 0,
    },
  });

  const baseUrl = process.env.NETSUITE_REST_URL;
  const authToken = process.env.NETSUITE_ACCESS_TOKEN;

  if (!baseUrl || !authToken) {
    logger.error({
      Module: 'netsuite-request',
      Message: 'Missing required environment variables for NetSuite request - NETSUITE_REST_URL or NETSUITE_ACCESS_TOKEN',
    });
    throw new Error('Missing required environment variables for NetSuite request - NETSUITE_REST_URL or NETSUITE_ACCESS_TOKEN');
  }




  const url = endpoint.startsWith('/')
    ? `${baseUrl.replace(/\/$/, '')}${endpoint}`
    : `${baseUrl.replace(/\/$/, '')}/${endpoint}`;

  logger.info({
    Module: 'netsuite-request',
    Message: 'Constructed full URL for NetSuite request',
    ObjectMsg: {
      baseUrl: baseUrl,
      endpoint: endpoint,
      fullUrl: url,
      urlLength: url.length,
    },
  });

  return request<T>({
    method,
    url,
    data,
    params,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...(headers || {}),
    },
  });
}

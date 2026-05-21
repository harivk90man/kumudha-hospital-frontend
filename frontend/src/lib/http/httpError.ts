import type { AxiosError } from 'axios';

/** Shape of the backend's GlobalExceptionHandler ErrorResponse record. */
export interface BackendError {
  requestId?: string;
  status: number;
  error: string;
  message: string;
  path: string;
  timestamp: string;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly data: unknown,
    public readonly url: string,
  ) {
    super(`HTTP ${status} ${statusText} — ${url}`);
    this.name = 'HttpError';
  }

  static fromAxiosError(error: AxiosError): HttpError {
    const status = error.response?.status ?? 0;
    const statusText = error.response?.statusText ?? error.code ?? 'Network Error';
    const data = error.response?.data ?? null;
    const url = `${error.config?.baseURL ?? ''}${error.config?.url ?? ''}`;
    return new HttpError(status, statusText, data, url);
  }
}

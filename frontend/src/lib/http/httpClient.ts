import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { HttpError, type BackendError } from './httpError';
import { useNetworkActivity } from '@/store/networkActivityStore';
import { useNotificationsStore } from '@/store/notificationsStore';
import { useAuthStore } from '@/features/auth/authStore';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api';

const instance = axios.create({
  baseURL,
  timeout: 30_000,
  headers: { Accept: 'application/json' },
});

instance.interceptors.request.use((config) => {
  useNetworkActivity.getState().increment();
  // Inject Bearer token for all requests except the login endpoint itself.
  // The login endpoint handles its own Authorization header (token revalidation path).
  const token = useAuthStore.getState().session?.accessToken;
  if (token && !config.url?.includes('/auth/login')) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

instance.interceptors.response.use(
  (response) => {
    useNetworkActivity.getState().decrement();
    return response;
  },
  (error: AxiosError) => {
    useNetworkActivity.getState().decrement();
    const httpError = HttpError.fromAxiosError(error);

    // Auto-push server errors (5xx) and network failures — caller cannot recover these.
    // 4xx are pushed manually by individual catch blocks with domain-specific messages.
    if (httpError.status === 0 || httpError.status >= 500) {
      const data = httpError.data as BackendError | null;
      useNotificationsStore.getState().push({
        type: 'error',
        title: httpError.status === 0 ? 'Network Error' : 'Server Error',
        message: data?.message ?? httpError.statusText,
      });
    }

    return Promise.reject(httpError);
  },
);

/** Shape of every paginated list response from the Spring Boot backend. */
export interface BackendPage<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export const httpClient = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    instance.get<T>(url, config).then((r) => r.data),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    instance.post<T>(url, data, config).then((r) => r.data),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    instance.put<T>(url, data, config).then((r) => r.data),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    instance.patch<T>(url, data, config).then((r) => r.data),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    instance.delete<T>(url, config).then((r) => r.data),
};

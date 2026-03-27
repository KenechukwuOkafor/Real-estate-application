export type ApiMeta = {
  requestId: string;
  timestamp: string;
};

export type ApiSuccess<T> = {
  data: T;
  meta: ApiMeta;
};

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode | string;
    message: string;
    details: unknown;
  };
  meta: ApiMeta;
};

export function createApiMeta(requestId: string): ApiMeta {
  return {
    requestId,
    timestamp: new Date().toISOString(),
  };
}

import { NextResponse } from "next/server";

import { createApiMeta } from "@/lib/api/response";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

type ResolvedError = {
  code: string;
  httpStatus: number;
  message: string;
};

export function resolveRouteError(error: unknown): ResolvedError {
  if (error instanceof AppError) {
    return { code: error.code, httpStatus: error.httpStatus, message: error.message };
  }

  const message = error instanceof Error ? error.message : "An unexpected error occurred.";

  if (message === "Unauthenticated request.") {
    return { code: "UNAUTHENTICATED", httpStatus: 401, message };
  }

  if (message.endsWith("role is required.")) {
    return { code: "UNAUTHORIZED", httpStatus: 403, message };
  }

  if (message === "AGENT_NOT_VERIFIED") {
    return { code: "AGENT_NOT_VERIFIED", httpStatus: 403, message };
  }

  if (message === "LISTING_SUBSCRIPTION_REQUIRED") {
    return { code: "SUBSCRIPTION_REQUIRED", httpStatus: 403, message };
  }

  if (message === "LISTING_DUPLICATE_DETECTED") {
    return { code: "LISTING_DUPLICATE_DETECTED", httpStatus: 409, message };
  }

  if (message === "LISTING_IMAGE_COUNT_INVALID") {
    return { code: "LISTING_IMAGE_COUNT_INVALID", httpStatus: 422, message };
  }

  if (message === "LISTING_STATE_TRANSITION_INVALID" || message.includes("cannot be")) {
    return { code: "LISTING_STATE_TRANSITION_INVALID", httpStatus: 422, message };
  }

  if (message.endsWith(" not found.")) {
    return { code: "NOT_FOUND", httpStatus: 404, message };
  }

  // Compare-and-set failures from the repository layer: another request moved
  // the row between our read and our write. Retrying with fresh state is the
  // correct client behaviour, so these are conflicts rather than 422s.
  if (message === "LISTING_STATE_CONFLICT") {
    return {
      code: "LISTING_STATE_CONFLICT",
      httpStatus: 409,
      message: "This listing changed while you were working on it. Reload and try again.",
    };
  }

  if (message === "AGENT_QUOTA_CONFLICT") {
    return {
      code: "AGENT_QUOTA_CONFLICT",
      httpStatus: 409,
      message: "Your listing quota changed while you were working. Reload and try again.",
    };
  }

  if (message.includes("already been reviewed") || message.includes("already exists")) {
    return { code: "CONFLICT", httpStatus: 409, message };
  }

  if (
    message.includes("required") ||
    message.includes("Invalid") ||
    message.includes("invalid") ||
    message.includes("must be") ||
    message.includes("or fewer") ||
    message.includes("cannot have") ||
    message.includes("before") ||
    message.includes("at least") ||
    message.includes("cannot be negative")
  ) {
    return { code: "VALIDATION_ERROR", httpStatus: 422, message };
  }

  return { code: "INTERNAL_ERROR", httpStatus: 500, message };
}

export function routeErrorResponse(error: unknown, requestId: string) {
  const { code, httpStatus, message } = resolveRouteError(error);

  return NextResponse.json(
    {
      error: { code, details: null, message },
      meta: createApiMeta(requestId),
    },
    { status: httpStatus },
  );
}

import "server-only";

import { currentContext } from "@/lib/observability/context";
import { sanitize } from "@/lib/observability/sanitize";

/**
 * Structured logging.
 *
 * REB-ENG-005 specifies the fields and forbids free-form text: timestamp,
 * level, service, environment, request id, user id when authenticated, event
 * name, error code, duration. An operator greps these; a sentence is not
 * greppable.
 *
 * `event` is a stable name, not a description. "ListingApprovalFailed" can be
 * counted over time. "failed to approve listing 3c71…" cannot.
 *
 * Everything is sanitized on the way out. The logger is not a trusted caller:
 * most accidental disclosure is someone logging a whole request object without
 * looking at what is inside it.
 */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

const LEVEL_RANK: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  FATAL: 50,
};

export type LogFields = {
  /** Stable, countable event name. */
  event: string;
  errorCode?: string;
  /** Milliseconds. */
  duration?: number;
  message?: string;
  error?: unknown;
  [key: string]: unknown;
};

function environment() {
  return process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "development";
}

function minimumLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL?.toUpperCase();

  if (configured && configured in LEVEL_RANK) {
    return configured as LogLevel;
  }

  // REB-ARCH-009: production minimises DEBUG.
  return environment() === "production" ? "INFO" : "DEBUG";
}

function isDevelopment() {
  return environment() !== "production";
}

function emit(level: LogLevel, fields: LogFields) {
  if (LEVEL_RANK[level] < LEVEL_RANK[minimumLevel()]) {
    return;
  }

  const context = currentContext();

  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: context?.service ?? "app",
    environment: environment(),
    requestId: context?.requestId,
    userId: context?.userId,
    enqueuedByRequestId: context?.enqueuedByRequestId,
    ...fields,
  };

  const safe = sanitize(record) as Record<string, unknown>;

  // Development is deliberately loud and readable rather than machine-parsable:
  // nothing is shipping these lines anywhere, a human is reading them in a
  // terminal, and JSON on one line is the format most likely to be skimmed past.
  if (isDevelopment()) {
    const { event, level: lvl, requestId, ...rest } = safe;
    const head = `${lvl} ${String(event)}${requestId ? ` [${String(requestId).slice(0, 8)}]` : ""}`;

    if (level === "ERROR" || level === "FATAL") {
      console.error(head, rest);
    } else if (level === "WARN") {
      console.warn(head, rest);
    } else {
      console.log(head, rest);
    }

    return;
  }

  const line = JSON.stringify(safe);

  if (level === "ERROR" || level === "FATAL") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (fields: LogFields) => emit("DEBUG", fields),
  error: (fields: LogFields) => emit("ERROR", fields),
  fatal: (fields: LogFields) => emit("FATAL", fields),
  info: (fields: LogFields) => emit("INFO", fields),
  warn: (fields: LogFields) => emit("WARN", fields),
};

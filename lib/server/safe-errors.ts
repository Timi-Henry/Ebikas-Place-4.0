import {
  RequestSecurityError,
  type RequestContext
} from "@/lib/server/request-security";

type SafeLogValue = string | number | boolean | null | undefined;

export interface ServerErrorLogContext extends RequestContext {
  event: string;
  metadata?: Readonly<Record<string, SafeLogValue>>;
}

const SENSITIVE_KEY = /auth|body|cookie|credential|key|password|payload|secret|session|token/i;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

function safeText(value: string, maxLength: number) {
  return value.replace(CONTROL_CHARACTERS, " ").slice(0, maxLength);
}

function safeMetadata(metadata: ServerErrorLogContext["metadata"]) {
  if (!metadata) return undefined;

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      const safeKey = safeText(key, 64);
      if (SENSITIVE_KEY.test(key)) return [safeKey, "[REDACTED]"];
      return [safeKey, typeof value === "string" ? safeText(value, 256) : value ?? null];
    })
  );
}

/**
 * Logs only operational identifiers. Raw request data, headers, error messages,
 * and stacks are deliberately excluded because they can contain credentials.
 */
export function logServerError(error: unknown, context: ServerErrorLogContext) {
  const isRequestError = error instanceof RequestSecurityError;
  const errorName = error instanceof Error ? safeText(error.name, 80) : "UnknownError";

  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: safeText(context.event, 80),
    requestId: safeText(context.requestId, 128),
    method: safeText(context.method, 12),
    pathname: safeText(context.pathname, 256),
    error: {
      name: errorName,
      code: isRequestError ? error.code : "internal_error"
    },
    metadata: safeMetadata(context.metadata)
  }));
}

export function safeErrorResponse(error: unknown, context: ServerErrorLogContext) {
  const knownError = error instanceof RequestSecurityError;
  if (!knownError) logServerError(error, context);

  const status = knownError ? error.status : 500;
  const code = knownError ? error.code : "internal_error";
  const message = knownError ? error.message : "Unable to complete this request.";

  return Response.json(
    { error: message, code, requestId: context.requestId },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-request-id": context.requestId
      }
    }
  );
}

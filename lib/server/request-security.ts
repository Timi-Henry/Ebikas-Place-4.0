const DEFAULT_MAX_JSON_BYTES = 64 * 1024;
const MAX_CONFIGURABLE_JSON_BYTES = 1024 * 1024;
const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type RequestSecurityErrorCode =
  | "invalid_content_length"
  | "invalid_content_type"
  | "invalid_json"
  | "invalid_request_body"
  | "missing_request_body"
  | "rate_limit_exceeded"
  | "request_body_too_large"
  | "request_origin_not_allowed";

type RequestSecurityStatus = 400 | 403 | 413 | 415 | 422 | 429;

export class RequestSecurityError extends Error {
  readonly code: RequestSecurityErrorCode;
  readonly status: RequestSecurityStatus;

  constructor(code: RequestSecurityErrorCode, status: RequestSecurityStatus, message: string) {
    super(message);
    this.name = "RequestSecurityError";
    this.code = code;
    this.status = status;
  }
}

export interface RuntimeSchema<T> {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error?: unknown };
}

export interface SameOriginOptions {
  /** Canonical application origin. Pass the validated deployment origin in production. */
  expectedOrigin?: string;
  /** Additional exact origins for intentional, trusted cross-origin callers. */
  allowedOrigins?: readonly string[];
  /** Keep false for browser-authenticated mutations. Useful only for non-browser clients. */
  allowMissingOrigin?: boolean;
}

export interface BoundedJsonOptions {
  maxBytes?: number;
}

function configuredMaxBytes(value: number | undefined) {
  const maxBytes = value ?? DEFAULT_MAX_JSON_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_CONFIGURABLE_JSON_BYTES) {
    throw new RangeError(`maxBytes must be an integer between 1 and ${MAX_CONFIGURABLE_JSON_BYTES}.`);
  }
  return maxBytes;
}

function parseOrigin(value: string | null) {
  if (!value || value === "null") return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function configuredOrigins(request: Request, expectedOrigin: string | undefined, additionalOrigins: readonly string[]) {
  const primaryOrigin = parseOrigin(expectedOrigin ?? new URL(request.url).origin);
  if (!primaryOrigin) {
    throw new TypeError("The trusted request origin must use http or https.");
  }

  const origins = new Set([primaryOrigin]);
  for (const value of additionalOrigins) {
    const origin = parseOrigin(value);
    if (!origin) {
      throw new TypeError(`Invalid trusted origin configuration: ${value}`);
    }
    origins.add(origin);
  }
  return origins;
}

/**
 * Enforces an exact Origin/Referer match for cookie-authenticated mutations.
 * It is intentionally a no-op for safe methods so routes can call it uniformly.
 */
export function assertSameOrigin(request: Request, options: SameOriginOptions = {}) {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const allowedOrigins = configuredOrigins(request, options.expectedOrigin, options.allowedOrigins ?? []);
  const origin = parseOrigin(request.headers.get("origin"));
  const refererOrigin = parseOrigin(request.headers.get("referer"));
  const callerOrigin = origin ?? refererOrigin;

  if (!callerOrigin && options.allowMissingOrigin) return;
  if (!callerOrigin || !allowedOrigins.has(callerOrigin)) {
    throw new RequestSecurityError(
      "request_origin_not_allowed",
      403,
      "This request origin is not allowed."
    );
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new RequestSecurityError(
      "request_origin_not_allowed",
      403,
      "This request origin is not allowed."
    );
  }
}

function assertJsonContentType(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json" && !contentType?.endsWith("+json")) {
    throw new RequestSecurityError(
      "invalid_content_type",
      415,
      "Content-Type must be application/json."
    );
  }
}

function assertedContentLength(request: Request, maxBytes: number) {
  const value = request.headers.get("content-length");
  if (value === null) return;
  if (!/^\d+$/.test(value)) {
    throw new RequestSecurityError("invalid_content_length", 400, "Content-Length is invalid.");
  }

  const contentLength = Number(value);
  if (!Number.isSafeInteger(contentLength)) {
    throw new RequestSecurityError("invalid_content_length", 400, "Content-Length is invalid.");
  }
  if (contentLength > maxBytes) {
    throw new RequestSecurityError("request_body_too_large", 413, "Request body is too large.");
  }
}

async function readBoundedBody(request: Request, maxBytes: number) {
  if (!request.body) {
    throw new RequestSecurityError("missing_request_body", 400, "Request body is required.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RequestSecurityError("request_body_too_large", 413, "Request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    throw new RequestSecurityError("missing_request_body", 400, "Request body is required.");
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

/** Reads, bounds, parses, and runtime-validates a JSON request body. */
export async function parseBoundedJson<T>(
  request: Request,
  schema: RuntimeSchema<T>,
  options: BoundedJsonOptions = {}
) {
  const maxBytes = configuredMaxBytes(options.maxBytes);
  assertJsonContentType(request);
  assertedContentLength(request, maxBytes);

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readBoundedBody(request, maxBytes));
  } catch (error) {
    if (error instanceof RequestSecurityError) throw error;
    throw new RequestSecurityError("invalid_json", 400, "Request body must be valid JSON.");
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new RequestSecurityError("invalid_request_body", 422, "Request body is invalid.");
  }
  return result.data;
}

export function getRequestId(request: Request) {
  const suppliedId = request.headers.get("x-request-id")?.trim();
  return suppliedId && SAFE_REQUEST_ID.test(suppliedId)
    ? suppliedId
    : globalThis.crypto.randomUUID();
}

export interface RequestContext {
  method: string;
  pathname: string;
  requestId: string;
}

export function createRequestContext(request: Request): RequestContext {
  return {
    method: request.method.toUpperCase(),
    pathname: new URL(request.url).pathname,
    requestId: getRequestId(request)
  };
}

export function withRequestId(response: Response, requestId: string) {
  const headers = new Headers(response.headers);
  headers.set(
    "x-request-id",
    SAFE_REQUEST_ID.test(requestId) ? requestId : globalThis.crypto.randomUUID()
  );
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText
  });
}

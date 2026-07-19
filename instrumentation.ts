import type { Instrumentation } from "next";
import { logServerError } from "@/lib/server/safe-errors";

export function register() {
  // Provider-specific telemetry can be initialized here without changing routes.
}

export const onRequestError: Instrumentation.onRequestError = (error, request, errorContext) => {
  logServerError(error, {
    event: "next_request_error",
    requestId: globalThis.crypto.randomUUID(),
    method: request.method || "UNKNOWN",
    pathname: request.path || errorContext.routePath,
    metadata: {
      routeType: errorContext.routeType,
      routerKind: errorContext.routerKind,
      renderSource: errorContext.renderSource
    }
  });
};

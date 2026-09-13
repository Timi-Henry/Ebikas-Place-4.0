import "server-only";
import {
  TransactionalEmailProviderError,
  type TransactionalEmailMessage,
  type TransactionalEmailResult
} from "@/lib/email-delivery";
import {
  createResendBatchPayload,
  resendIdempotencyKey
} from "@/lib/resend-email";
import { getTransactionalEmailEnvironment } from "@/lib/server/env";

const RESEND_BATCH_EMAIL_URL = "https://api.resend.com/emails/batch";

function providerCode(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const candidate = "name" in payload && typeof payload.name === "string"
      ? payload.name
      : "code" in payload && typeof payload.code === "string"
        ? payload.code
        : null;
    if (candidate) {
      return candidate.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80) || `http_${status}`;
    }
  }
  return `http_${status}`;
}

function messageIds(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  if (!("data" in payload) || !Array.isArray(payload.data)) return [];
  return payload.data.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || !("id" in entry) || typeof entry.id !== "string") return [];
    return entry.id.length > 0 ? [entry.id] : [];
  });
}

export async function sendTransactionalEmails(
  messages: readonly TransactionalEmailMessage[],
  options: { operationId: string }
): Promise<TransactionalEmailResult> {
  const config = getTransactionalEmailEnvironment();
  const requestPayload = createResendBatchPayload(messages, config.sender);
  const idempotencyKey = resendIdempotencyKey(options.operationId);
  let response: Response;
  try {
    response = await fetch(RESEND_BATCH_EMAIL_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey
      },
      body: JSON.stringify(requestPayload),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    // Keep network and timeout failures retryable without leaking transport or
    // environment details into the background-job error record.
    throw new TransactionalEmailProviderError("request_failed", null);
  }
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const code = providerCode(payload, response.status);
    const retryableConflict = response.status === 409
      && (code === "concurrent_idempotent_requests" || code === "resource_locked");
    throw new TransactionalEmailProviderError(code, response.status, retryableConflict || undefined);
  }

  const ids = messageIds(payload);
  if (ids.length !== messages.length) {
    throw new TransactionalEmailProviderError("invalid_provider_response", null);
  }
  return { messageIds: ids };
}

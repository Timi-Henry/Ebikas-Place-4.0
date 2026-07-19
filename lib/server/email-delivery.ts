import "server-only";
import { createBrevoTransactionalPayload } from "@/lib/brevo-email";
import {
  TransactionalEmailProviderError,
  type TransactionalEmailMessage,
  type TransactionalEmailResult
} from "@/lib/email-delivery";
import { getTransactionalEmailEnvironment } from "@/lib/server/env";

const BREVO_TRANSACTIONAL_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";

function providerCode(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string") {
    return payload.code.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80) || `http_${status}`;
  }
  return `http_${status}`;
}

function messageIds(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  if ("messageIds" in payload && Array.isArray(payload.messageIds)) {
    return payload.messageIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  }
  if ("messageId" in payload && typeof payload.messageId === "string" && payload.messageId.length > 0) {
    return [payload.messageId];
  }
  return [];
}

export async function sendTransactionalEmails(
  messages: readonly TransactionalEmailMessage[],
  options: { operationId: string }
): Promise<TransactionalEmailResult> {
  const config = getTransactionalEmailEnvironment();
  const requestPayload = createBrevoTransactionalPayload(messages, config.sender, options.operationId);
  let response: Response;
  try {
    response = await fetch(BREVO_TRANSACTIONAL_EMAIL_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": config.apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify(requestPayload),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    // Keep network and timeout failures retryable without leaking transport or
    // environment details into the Inngest run error.
    throw new TransactionalEmailProviderError("request_failed", null);
  }
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const code = providerCode(payload, response.status);
    // Brevo returns this when a retry reuses the operation UUID. The original
    // request was accepted, so allow the caller to persist its delivery receipt.
    if (response.status === 400 && code === "duplicate_parameter") {
      return {
        messageIds: messages.map(
          (_, index) => `brevo-idempotent-${requestPayload.headers.idempotencyKey}-${index + 1}`
        )
      };
    }
    throw new TransactionalEmailProviderError(code, response.status);
  }

  const ids = messageIds(payload);
  if (ids.length !== messages.length) {
    throw new TransactionalEmailProviderError("invalid_provider_response", null);
  }
  return { messageIds: ids };
}

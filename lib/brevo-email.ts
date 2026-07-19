import { createHash } from "node:crypto";
import type {
  TransactionalEmailMessage,
  TransactionalEmailSender
} from "@/lib/email-delivery";

const UUID_DNS_NAMESPACE = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");
const MAX_EMAIL_NAME_LENGTH = 70;

type BrevoRecipient = { email: string; name?: string };

type BrevoMessageVersion = {
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
  textContent: string;
  replyTo?: BrevoRecipient;
};

export type BrevoTransactionalPayload = {
  sender: TransactionalEmailSender;
  subject: string;
  htmlContent: string;
  textContent: string;
  headers: { idempotencyKey: string };
  tags?: string[];
  to?: BrevoRecipient[];
  replyTo?: BrevoRecipient;
  messageVersions?: BrevoMessageVersion[];
};

/** Brevo requires a UUID idempotency value, so derive a stable UUIDv5 from the operation ID. */
export function emailOperationUuid(operationId: string) {
  const bytes = createHash("sha1")
    .update(UUID_DNS_NAMESPACE)
    .update(`ebikas-place:transactional-email:${operationId}`, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function emailName(name?: string) {
  const normalized = name?.trim();
  if (!normalized) return undefined;
  return [...normalized].slice(0, MAX_EMAIL_NAME_LENGTH).join("");
}

function recipient(email: string, name?: string): BrevoRecipient {
  const normalizedName = emailName(name);
  return normalizedName ? { email, name: normalizedName } : { email };
}

function replyTo(message: TransactionalEmailMessage) {
  return message.replyTo ? recipient(message.replyTo) : undefined;
}

function version(message: TransactionalEmailMessage): BrevoMessageVersion {
  const messageReplyTo = replyTo(message);
  return {
    to: [recipient(message.to, message.toName)],
    subject: message.subject,
    htmlContent: message.html,
    textContent: message.text,
    ...(messageReplyTo ? { replyTo: messageReplyTo } : {})
  };
}

function sharedTags(messages: readonly TransactionalEmailMessage[]) {
  const [first, ...rest] = messages;
  if (!first?.tags?.length) return [];
  return [...new Set(first.tags)].filter((tag) => rest.every((message) => message.tags?.includes(tag)));
}

export function createBrevoTransactionalPayload(
  messages: readonly TransactionalEmailMessage[],
  sender: TransactionalEmailSender,
  operationId: string
): BrevoTransactionalPayload {
  if (messages.length === 0) throw new TypeError("At least one transactional email is required.");

  const first = messages[0];
  const tags = sharedTags(messages);
  const senderName = emailName(sender.name);
  const shared = {
    sender: {
      email: sender.email,
      ...(senderName ? { name: senderName } : {})
    },
    subject: first.subject,
    htmlContent: first.html,
    textContent: first.text,
    headers: { idempotencyKey: emailOperationUuid(operationId) },
    ...(tags.length > 0 ? { tags } : {})
  };

  if (messages.length === 1) {
    const messageReplyTo = replyTo(first);
    return {
      ...shared,
      to: [recipient(first.to, first.toName)],
      ...(messageReplyTo ? { replyTo: messageReplyTo } : {})
    };
  }

  return {
    ...shared,
    messageVersions: messages.map(version)
  };
}

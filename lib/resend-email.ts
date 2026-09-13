import { createHash } from "node:crypto";
import type {
  TransactionalEmailMessage,
  TransactionalEmailSender
} from "@/lib/email-delivery";

const MAX_EMAIL_NAME_LENGTH = 100;
const MAX_RESEND_BATCH_SIZE = 100;

export type ResendEmailTag = {
  name: string;
  value: string;
};

export type ResendEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
  tags?: ResendEmailTag[];
};

/** Keep provider idempotency keys opaque, deterministic, and well below Resend's 256-character limit. */
export function resendIdempotencyKey(operationId: string) {
  const digest = createHash("sha256")
    .update(`ebikas-place:transactional-email:${operationId}`, "utf8")
    .digest("hex");
  return `ebikas-place/${digest}`;
}

function emailName(name?: string) {
  const normalized = name
    ?.replace(/[\r\n<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return undefined;
  return [...normalized].slice(0, MAX_EMAIL_NAME_LENGTH).join("");
}

function mailbox(email: string, name?: string) {
  const normalizedName = emailName(name);
  return normalizedName ? `${normalizedName} <${email}>` : email;
}

function tagName(value: string, index: number) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 240);
  return normalized || `label-${index + 1}`;
}

function tags(values?: readonly string[]) {
  if (!values?.length) return undefined;
  return [...new Set(values)].slice(0, 10).map((value, index) => ({
    name: tagName(value, index),
    value: "true"
  }));
}

export function createResendBatchPayload(
  messages: readonly TransactionalEmailMessage[],
  sender: TransactionalEmailSender
): ResendEmailPayload[] {
  if (messages.length === 0) throw new TypeError("At least one transactional email is required.");
  if (messages.length > MAX_RESEND_BATCH_SIZE) {
    throw new TypeError(`A Resend batch can contain at most ${MAX_RESEND_BATCH_SIZE} emails.`);
  }

  const from = mailbox(sender.email, sender.name);
  return messages.map((message) => {
    const messageTags = tags(message.tags);
    return {
      from,
      to: [mailbox(message.to, message.toName)],
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      ...(messageTags ? { tags: messageTags } : {})
    };
  });
}

export type TransactionalEmailMessage = {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: string[];
};

export type TransactionalEmailResult = {
  messageIds: string[];
};

export type TransactionalEmailSender = {
  email: string;
  name?: string;
};

export class TransactionalEmailProviderError extends Error {
  readonly retryable: boolean;

  constructor(
    public readonly code: string,
    public readonly statusCode: number | null
  ) {
    super(`Transactional email provider rejected the request (${code}).`);
    this.name = "TransactionalEmailProviderError";
    this.retryable = statusCode === null || statusCode === 408 || statusCode === 429 || statusCode >= 500;
  }
}

export function isPermanentTransactionalEmailError(error: unknown) {
  return error instanceof TransactionalEmailProviderError && !error.retryable;
}

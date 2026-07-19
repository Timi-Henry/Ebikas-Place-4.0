export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

const MAX_CURSOR_LENGTH = 512;

type CursorPayload = {
  v: 1;
  sortAt: string;
  id: string;
};

export type SeekCursor = {
  sortAt: Date;
  id: string;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor?: string;
};

export class InvalidCursorError extends Error {
  readonly code = "INVALID_CURSOR";

  constructor(message = "The pagination cursor is invalid or expired.") {
    super(message);
    this.name = "InvalidCursorError";
  }
}

export function normalizePageSize(
  value: number | undefined,
  fallback = DEFAULT_PAGE_SIZE,
  maximum = MAX_PAGE_SIZE
) {
  if (!Number.isInteger(fallback) || fallback < 1 || !Number.isInteger(maximum) || maximum < fallback) {
    throw new RangeError("Pagination bounds are misconfigured.");
  }

  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`Page size must be an integer between 1 and ${maximum}.`);
  }
  return value;
}

export function encodeSeekCursor(cursor: SeekCursor) {
  if (!(cursor.sortAt instanceof Date) || Number.isNaN(cursor.sortAt.getTime()) || !cursor.id) {
    throw new InvalidCursorError();
  }

  const payload: CursorPayload = {
    v: 1,
    sortAt: cursor.sortAt.toISOString(),
    id: cursor.id
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeSeekCursor(value: string) {
  if (!value || value.length > MAX_CURSOR_LENGTH) {
    throw new InvalidCursorError();
  }

  try {
    const payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CursorPayload>;
    if (payload.v !== 1 || typeof payload.sortAt !== "string" || typeof payload.id !== "string") {
      throw new InvalidCursorError();
    }

    const sortAt = new Date(payload.sortAt);
    if (Number.isNaN(sortAt.getTime()) || sortAt.toISOString() !== payload.sortAt || !payload.id || payload.id.length > 128) {
      throw new InvalidCursorError();
    }

    return { sortAt, id: payload.id } satisfies SeekCursor;
  } catch (error) {
    if (error instanceof InvalidCursorError) throw error;
    throw new InvalidCursorError();
  }
}

import "server-only";
import { ObjectId } from "mongodb";
import {
  decodeSeekCursor,
  encodeSeekCursor,
  InvalidCursorError,
  type CursorPage
} from "@/lib/cursor-pagination";

export type CreatedAtDocument = {
  _id: ObjectId;
  createdAt: Date;
};

export function decodeMongoCursor(value: string | undefined) {
  if (!value) return undefined;
  const cursor = decodeSeekCursor(value);
  if (!ObjectId.isValid(cursor.id)) throw new InvalidCursorError();
  return { createdAt: cursor.sortAt, _id: new ObjectId(cursor.id) };
}

export function createdBefore(cursor: ReturnType<typeof decodeMongoCursor>) {
  if (!cursor) return {};
  return {
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor._id } }
    ]
  };
}

export function toCursorPage<TDocument extends CreatedAtDocument, TResult>(
  documents: TDocument[],
  limit: number,
  convert: (document: TDocument) => TResult
): CursorPage<TResult> {
  const hasMore = documents.length > limit;
  const visible = hasMore ? documents.slice(0, limit) : documents;
  const last = visible.at(-1);

  return {
    items: visible.map(convert),
    nextCursor:
      hasMore && last
        ? encodeSeekCursor({ sortAt: last.createdAt, id: last._id.toString() })
        : undefined
  };
}

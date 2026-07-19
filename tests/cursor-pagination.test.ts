import { describe, expect, it } from "vitest";
import {
  decodeSeekCursor,
  encodeSeekCursor,
  InvalidCursorError,
  normalizePageSize
} from "@/lib/cursor-pagination";

describe("cursor pagination", () => {
  it("round-trips an opaque stable seek cursor", () => {
    const cursor = { sortAt: new Date("2026-07-18T12:34:56.789Z"), id: "507f1f77bcf86cd799439011" };

    expect(decodeSeekCursor(encodeSeekCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed and non-canonical cursors", () => {
    expect(() => decodeSeekCursor("not-json")).toThrow(InvalidCursorError);

    const nonCanonicalDate = Buffer.from(
      JSON.stringify({ v: 1, sortAt: "2026-07-18", id: "507f1f77bcf86cd799439011" })
    ).toString("base64url");
    expect(() => decodeSeekCursor(nonCanonicalDate)).toThrow(InvalidCursorError);
  });

  it("bounds page sizes before database work starts", () => {
    expect(normalizePageSize(undefined)).toBe(24);
    expect(normalizePageSize(50)).toBe(50);
    expect(() => normalizePageSize(0)).toThrow(RangeError);
    expect(() => normalizePageSize(101)).toThrow(RangeError);
    expect(() => normalizePageSize(2.5)).toThrow(RangeError);
  });
});

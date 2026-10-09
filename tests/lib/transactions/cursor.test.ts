import { describe, it, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  InvalidCursorError,
  type TxCursor,
} from "@/lib/transactions/cursor";

const dateDesc = { sort: "date" as const, direction: "desc" as const };

describe("transactions cursor: round trip", () => {
  it("round-trips a date keyset cursor", () => {
    const c: TxCursor = { v: 1, s: "date", d: "desc", k: "2026-03-01", id: 42 };
    const raw = encodeCursor(c);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(raw, dateDesc)).toEqual(c);
  });

  it("round-trips an amount keyset cursor with a negative fractional value", () => {
    const c: TxCursor = { v: 1, s: "amount", d: "asc", k: -12.34, id: 7 };
    expect(decodeCursor(encodeCursor(c), { sort: "amount", direction: "asc" })).toEqual(c);
  });

  it("round-trips an offset cursor for a non-keyset sort", () => {
    const c: TxCursor = { v: 1, s: "quantity", d: "asc", o: 350 };
    expect(decodeCursor(encodeCursor(c), { sort: "quantity", direction: "asc" })).toEqual(c);
  });
});

describe("transactions cursor: tamper and shape", () => {
  const good = encodeCursor({ v: 1, s: "date", d: "desc", k: "2026-03-01", id: 42 });

  it("rejects a cursor with a character altered so the base64url no longer decodes to JSON", () => {
    const tampered = good.slice(0, 5) + (good[5] === "A" ? "!" : "A") + good.slice(6);
    expect(() => decodeCursor(tampered, dateDesc)).toThrow(InvalidCursorError);
  });

  it("rejects a cursor whose payload has a non-date keyset value", () => {
    const raw = encodeCursor({ v: 1, s: "date", d: "desc", k: "2026-13-99", id: 42 } as unknown as TxCursor);
    expect(() => decodeCursor(raw, dateDesc)).toThrow(InvalidCursorError);
  });

  it("rejects a cursor with an unknown extra key", () => {
    const raw = Buffer.from(
      JSON.stringify({ v: 1, s: "date", d: "desc", k: "2026-03-01", id: 42, x: 1 }),
    ).toString("base64url");
    expect(() => decodeCursor(raw, dateDesc)).toThrow(InvalidCursorError);
  });

  it("rejects a wrong version", () => {
    const raw = Buffer.from(JSON.stringify({ v: 2, s: "date", d: "desc", k: "2026-03-01", id: 42 })).toString("base64url");
    expect(() => decodeCursor(raw, dateDesc)).toThrow(InvalidCursorError);
  });

  it("rejects a non-positive or non-integer id", () => {
    for (const id of [0, -1, 1.5, "42"]) {
      const raw = Buffer.from(JSON.stringify({ v: 1, s: "date", d: "desc", k: "2026-03-01", id })).toString("base64url");
      expect(() => decodeCursor(raw, dateDesc)).toThrow(InvalidCursorError);
    }
  });

  it("rejects a negative or fractional offset", () => {
    for (const o of [-1, 2.5, null]) {
      const raw = Buffer.from(JSON.stringify({ v: 1, s: "quantity", d: "asc", o })).toString("base64url");
      expect(() => decodeCursor(raw, { sort: "quantity", direction: "asc" })).toThrow(InvalidCursorError);
    }
  });
});

describe("transactions cursor: sort and direction must match the request", () => {
  it("rejects a cursor minted for another sort", () => {
    const raw = encodeCursor({ v: 1, s: "amount", d: "desc", k: 5, id: 1 });
    expect(() => decodeCursor(raw, dateDesc)).toThrow(InvalidCursorError);
  });

  it("rejects a cursor minted for the other direction", () => {
    const raw = encodeCursor({ v: 1, s: "date", d: "asc", k: "2026-03-01", id: 1 });
    expect(() => decodeCursor(raw, dateDesc)).toThrow(InvalidCursorError);
  });
});

describe("transactions cursor: garbage", () => {
  const garbage = [
    "",
    "!!!",
    "not base64 at all",
    "a".repeat(600),
    Buffer.from("not json").toString("base64url"),
    Buffer.from("[1,2,3]").toString("base64url"),
    Buffer.from("null").toString("base64url"),
    Buffer.from('"string"').toString("base64url"),
    "eyJ2IjoxLCJzIjoi", // truncated base64url
  ];

  for (const raw of garbage) {
    it(`throws InvalidCursorError for ${JSON.stringify(raw.slice(0, 24))}`, () => {
      expect(() => decodeCursor(raw, dateDesc)).toThrow(InvalidCursorError);
    });
  }

  it("InvalidCursorError is a named Error with a stable message", () => {
    try {
      decodeCursor("!!!", dateDesc);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).name).toBe("InvalidCursorError");
      expect((e as Error).message).toBe("Invalid cursor");
    }
  });
});

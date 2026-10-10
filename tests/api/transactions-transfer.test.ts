import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthEnc = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/auth/require-encryption", () => ({
  requireEncryption: (...a: unknown[]) => mockAuthEnc(...a),
}));
vi.mock("@/lib/transfer", () => ({
  createTransferPair: (...a: unknown[]) => mockCreate(...a),
  updateTransferPair: vi.fn(),
  deleteTransferPair: vi.fn(),
}));

import { POST } from "@/app/api/transactions/transfer/route";
import { createMockRequest, parseResponse, TEST_DEK } from "../helpers/api-test-utils";

const URL_ = "http://localhost:3000/api/transactions/transfer";
const base = { fromAccountId: 1, toAccountId: 2, enteredAmount: 100 };

function post(body: unknown) {
  return POST(createMockRequest(URL_, { method: "POST", body }));
}

describe("API /api/transactions/transfer POST — enteredCurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthEnc.mockResolvedValue({ ok: true, userId: "u1", dek: TEST_DEK, sessionId: "s1" });
    mockCreate.mockResolvedValue({ ok: true, linkId: "l", fromTransactionId: 1, toTransactionId: 2 });
  });

  it("omitting enteredCurrency keeps the legacy call shape (undefined is passed through)", async () => {
    const res = await post(base);
    const { status } = await parseResponse(res);
    expect(status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const opts = mockCreate.mock.calls[0][0];
    expect(opts.enteredAmount).toBe(100);
    expect(opts.enteredCurrency).toBeUndefined();
  });

  it("passes a valid enteredCurrency through to createTransferPair", async () => {
    const res = await post({ ...base, enteredCurrency: "EUR" });
    expect((await parseResponse(res)).status).toBe(201);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ enteredAmount: 100, enteredCurrency: "EUR" });
  });

  it("accepts 4-letter crypto codes such as USDT", async () => {
    const res = await post({ ...base, enteredCurrency: "USDT" });
    expect((await parseResponse(res)).status).toBe(201);
    expect(mockCreate.mock.calls[0][0].enteredCurrency).toBe("USDT");
  });

  it("rejects a malformed currency code with 400 and never calls the lib", async () => {
    for (const bad of ["", "US", "EUROS", "E1R", "$$$"]) {
      mockCreate.mockClear();
      const res = await post({ ...base, enteredCurrency: bad });
      const { status, data } = await parseResponse(res);
      expect(status).toBe(400);
      expect(String((data as { error: string }).error)).toMatch(/enteredCurrency/);
      expect(mockCreate).not.toHaveBeenCalled();
    }
  });

  it("rejects a non-string currency with 400 and never calls the lib", async () => {
    const res = await post({ ...base, enteredCurrency: 840 });
    expect((await parseResponse(res)).status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("maps fx-currency-needs-override from the entered currency to 409 with side and currency", async () => {
    mockCreate.mockResolvedValueOnce({
      ok: false,
      code: "fx-currency-needs-override",
      message: "No FX rate available for XYZ.",
      side: "source",
      currency: "XYZ",
    });
    const res = await post({ ...base, enteredCurrency: "XYZ" });
    const { status, data } = await parseResponse(res);
    expect(status).toBe(409);
    expect(data).toMatchObject({ code: "fx-currency-needs-override", currency: "XYZ", side: "source" });
  });
});

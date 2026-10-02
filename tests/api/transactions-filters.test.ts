/**
 * Tests for new mobile search filters: direction and absolute amount range.
 * These test the integration of the new filters at the API route level.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(async () => ({
    authenticated: true,
    context: { userId: "default", method: "passphrase" as const, mfaVerified: false, dek: Buffer.alloc(32, 0xaa), sessionId: "test-session-jti" },
  })),
}));

const mockGetTransactions = vi.fn();
const mockGetTransactionCount = vi.fn();
vi.mock("@/lib/queries", () => ({
  getTransactions: (...args: unknown[]) => mockGetTransactions(...args),
  getTransactionCount: (...args: unknown[]) => mockGetTransactionCount(...args),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));

vi.mock("@/lib/verify-ownership", () => ({
  verifyOwnership: vi.fn(async () => undefined),
  OwnershipError: class OwnershipError extends Error {
    constructor() { super("ownership"); }
  },
}));

import { GET } from "@/app/api/transactions/route";
import { createMockRequest, parseResponse } from "../helpers/api-test-utils";

describe("API /api/transactions - new mobile filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("direction filter", () => {
    it("passes direction='in' to query for incoming transactions", async () => {
      mockGetTransactions.mockReturnValue([]);
      mockGetTransactionCount.mockReturnValue(0);
      const req = createMockRequest("http://localhost:3000/api/transactions?direction=in");
      await GET(req);
      expect(mockGetTransactions).toHaveBeenCalledWith("default", expect.objectContaining({ direction: "in" }));
    });

    it("passes direction='out' to query for outgoing transactions", async () => {
      mockGetTransactions.mockReturnValue([]);
      mockGetTransactionCount.mockReturnValue(0);
      const req = createMockRequest("http://localhost:3000/api/transactions?direction=out");
      await GET(req);
      expect(mockGetTransactions).toHaveBeenCalledWith("default", expect.objectContaining({ direction: "out" }));
    });

    it("ignores invalid direction values", async () => {
      mockGetTransactions.mockReturnValue([]);
      mockGetTransactionCount.mockReturnValue(0);
      const req = createMockRequest("http://localhost:3000/api/transactions?direction=invalid");
      await GET(req);
      expect(mockGetTransactions).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({ direction: undefined })
      );
    });

    it("omits direction when not provided", async () => {
      mockGetTransactions.mockReturnValue([]);
      mockGetTransactionCount.mockReturnValue(0);
      const req = createMockRequest("http://localhost:3000/api/transactions");
      await GET(req);
      expect(mockGetTransactions).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({ direction: undefined })
      );
    });
  });

  describe("minAmount and maxAmount filters", () => {
    it("passes minAmount as absolute value to query", async () => {
      mockGetTransactions.mockReturnValue([]);
      mockGetTransactionCount.mockReturnValue(0);
      const req = createMockRequest("http://localhost:3000/api/transactions?minAmount=50");
      await GET(req);
      expect(mockGetTransactions).toHaveBeenCalledWith("default", expect.objectContaining({ minAmount: 50 }));
    });

    it("passes maxAmount as absolute value to query", async () => {
      mockGetTransactions.mockReturnValue([]);
      mockGetTransactionCount.mockReturnValue(0);
      const req = createMockRequest("http://localhost:3000/api/transactions?maxAmount=200");
      await GET(req);
      expect(mockGetTransactions).toHaveBeenCalledWith("default", expect.objectContaining({ maxAmount: 200 }));
    });

    it("passes both min and max amounts together", async () => {
      mockGetTransactions.mockReturnValue([]);
      mockGetTransactionCount.mockReturnValue(0);
      const req = createMockRequest("http://localhost:3000/api/transactions?minAmount=10&maxAmount=100");
      await GET(req);
      expect(mockGetTransactions).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({ minAmount: 10, maxAmount: 100 })
      );
    });

    it("ignores NaN amount values", async () => {
      mockGetTransactions.mockReturnValue([]);
      mockGetTransactionCount.mockReturnValue(0);
      const req = createMockRequest("http://localhost:3000/api/transactions?minAmount=invalid");
      await GET(req);
      expect(mockGetTransactions).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({ minAmount: undefined })
      );
    });

    it("omits amounts when not provided", async () => {
      mockGetTransactions.mockReturnValue([]);
      mockGetTransactionCount.mockReturnValue(0);
      const req = createMockRequest("http://localhost:3000/api/transactions");
      await GET(req);
      expect(mockGetTransactions).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({ minAmount: undefined, maxAmount: undefined })
      );
    });
  });

  describe("combined filters", () => {
    it("combines direction and amount filters", async () => {
      mockGetTransactions.mockReturnValue([]);
      mockGetTransactionCount.mockReturnValue(0);
      const req = createMockRequest(
        "http://localhost:3000/api/transactions?direction=out&minAmount=50&maxAmount=200"
      );
      await GET(req);
      expect(mockGetTransactions).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({
          direction: "out",
          minAmount: 50,
          maxAmount: 200,
        })
      );
    });

    it("combines new filters with existing filters", async () => {
      mockGetTransactions.mockReturnValue([]);
      mockGetTransactionCount.mockReturnValue(0);
      const req = createMockRequest(
        "http://localhost:3000/api/transactions?startDate=2024-01-01&direction=in&minAmount=100"
      );
      await GET(req);
      expect(mockGetTransactions).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({
          startDate: "2024-01-01",
          direction: "in",
          minAmount: 100,
        })
      );
    });
  });

  describe("count filter application", () => {
    it("applies filters to count query", async () => {
      mockGetTransactions.mockReturnValue([]);
      mockGetTransactionCount.mockReturnValue(5);
      const req = createMockRequest("http://localhost:3000/api/transactions?direction=in&minAmount=50");
      await GET(req);
      expect(mockGetTransactionCount).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({
          direction: "in",
          minAmount: 50,
        })
      );
    });
  });
});

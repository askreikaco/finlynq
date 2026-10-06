import { describe, it, expect, beforeEach } from 'vitest';
import {
  canDuplicate,
  buildPrefill,
  writePrefill,
  readAndClearPrefill,
  type PrefillData,
} from '@/lib/transactions/prefill';
import type { Transaction } from '@/app/(app)/transactions/_types';

// Mock sessionStorage
const mockSessionStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

const createMockTx = (overrides?: Partial<Transaction>): Transaction => ({
  id: 123,
  date: '2026-10-06',
  accountId: 1,
  accountName: 'Checking',
  accountType: 'bank',
  accountAlias: null,
  currency: 'USD',
  enteredCurrency: 'USD',
  amount: -50,
  enteredAmount: -50,
  categoryId: 1,
  categoryName: 'Food',
  categoryType: 'Expense',
  payee: 'Coffee Shop',
  note: 'Morning coffee',
  tags: 'daily,food',
  isBusiness: 0,
  quantity: null,
  portfolioHolding: null,
  portfolioHoldingSymbol: null,
  linkId: null,
  tradeLinkId: null,
  kind: null,
  source: 'manual',
  createdAt: '2026-10-06T10:00:00Z',
  updatedAt: '2026-10-06T10:00:00Z',
  ...overrides,
});

describe('prefill', () => {
  beforeEach(() => {
    mockSessionStorage.clear();
    Object.defineProperty(global, 'window', {
      value: { location: { search: '' }, sessionStorage: mockSessionStorage },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(global, 'sessionStorage', {
      value: mockSessionStorage,
      writable: true,
      configurable: true,
    });
  });

  describe('canDuplicate', () => {
    it('returns true for plain transactions', () => {
      const tx = createMockTx();
      expect(canDuplicate(tx, 'USD')).toBe(true);
    });

    it('returns false for transfer legs (linkId present)', () => {
      const tx = createMockTx({ linkId: '456' });
      expect(canDuplicate(tx, 'USD')).toBe(false);
    });

    it('returns false for trades (tradeLinkId present)', () => {
      const tx = createMockTx({ tradeLinkId: '789' });
      expect(canDuplicate(tx, 'USD')).toBe(false);
    });

    it('returns false for investments (kind present)', () => {
      const tx = createMockTx({ kind: 'buy' });
      expect(canDuplicate(tx, 'USD')).toBe(false);
    });

    it('returns false for quantity transactions (non-zero quantity)', () => {
      const tx = createMockTx({ quantity: 10 });
      expect(canDuplicate(tx, 'USD')).toBe(false);
    });

    it('returns false for multi-currency mismatches', () => {
      const tx = createMockTx({ enteredCurrency: 'EUR' });
      expect(canDuplicate(tx, 'USD')).toBe(false);
    });

    it('returns true when enteredCurrency matches account currency', () => {
      const tx = createMockTx({ enteredCurrency: 'USD' });
      expect(canDuplicate(tx, 'USD')).toBe(true);
    });
  });

  describe('buildPrefill', () => {
    it('copies all required fields', () => {
      const tx = createMockTx({
        amount: -100,
        enteredAmount: -100,
        accountId: 5,
        categoryId: 10,
        payee: 'Test Payee',
        note: 'Test Note',
        tags: 'tag1,tag2',
        isBusiness: 1,
      });
      const prefill = buildPrefill(tx);

      expect(prefill.amount).toBe('100');
      expect(prefill.accountId).toBe('5');
      expect(prefill.categoryId).toBe('10');
      expect(prefill.payee).toBe('Test Payee');
      expect(prefill.note).toBe('Test Note');
      expect(prefill.tags).toBe('tag1,tag2');
      expect(prefill.isBusiness).toBe(true);
    });

    it('infers txType from negative amount (Expense)', () => {
      const tx = createMockTx({ amount: -50 });
      const prefill = buildPrefill(tx);
      expect(prefill.txType).toBe('Expense');
    });

    it('infers txType from positive amount (Income)', () => {
      const tx = createMockTx({ amount: 100, enteredAmount: 100 });
      const prefill = buildPrefill(tx);
      expect(prefill.txType).toBe('Income');
    });

    it('infers txType as Income from zero amount', () => {
      const tx = createMockTx({ amount: 0, enteredAmount: 0 });
      const prefill = buildPrefill(tx);
      expect(prefill.txType).toBe('Income');
    });

    it('uses enteredAmount if available', () => {
      const tx = createMockTx({ amount: -50, enteredAmount: -75 });
      const prefill = buildPrefill(tx);
      expect(prefill.amount).toBe('75');
    });

    it('uses absolute value of amount', () => {
      const tx = createMockTx({ amount: -50 });
      const prefill = buildPrefill(tx);
      expect(prefill.amount).toBe('50');
    });

    it('never copies id, linkId, createdAt, source', () => {
      const tx = createMockTx({
        id: 999,
        linkId: 'link123',
        createdAt: '2026-01-01T00:00:00Z',
        source: 'import',
      });
      const prefill = buildPrefill(tx);

      expect((prefill as Record<string, unknown>).id).toBeUndefined();
      expect((prefill as Record<string, unknown>).linkId).toBeUndefined();
      expect((prefill as Record<string, unknown>).createdAt).toBeUndefined();
      expect((prefill as Record<string, unknown>).source).toBeUndefined();
    });

    it('has v=1 and ts set', () => {
      const tx = createMockTx();
      const prefill = buildPrefill(tx);
      expect(prefill.v).toBe(1);
      expect(prefill.ts).toBeGreaterThan(0);
    });
  });

  describe('storage (writePrefill + readAndClearPrefill)', () => {
    beforeEach(() => {
      Object.defineProperty(global, 'sessionStorage', {
        value: mockSessionStorage,
        writable: true,
      });
    });

    it('one-shot: second read returns null', () => {
      const tx = createMockTx();
      const prefill = buildPrefill(tx);

      writePrefill(prefill);
      const first = readAndClearPrefill(Date.now());
      expect(first).not.toBeNull();

      const second = readAndClearPrefill(Date.now());
      expect(second).toBeNull();
    });

    it('malformed JSON returns null without throwing', () => {
      mockSessionStorage.setItem('finlynq:tx-prefill', '{invalid json}');
      const result = readAndClearPrefill(Date.now());
      expect(result).toBeNull();
    });

    it('wrong version returns null', () => {
      const data = { v: 2, amount: '50', ts: Date.now() };
      mockSessionStorage.setItem('finlynq:tx-prefill', JSON.stringify(data));
      const result = readAndClearPrefill(Date.now());
      expect(result).toBeNull();
    });

    it('expired prefill (> 2 min) returns null', () => {
      const tx = createMockTx();
      const prefill = buildPrefill(tx);
      writePrefill(prefill);

      // Read with time 2+ minutes later
      const twoMinutesLater = Date.now() + (2 * 60 * 1000) + 1;
      const result = readAndClearPrefill(twoMinutesLater);
      expect(result).toBeNull();
    });

    it('fresh prefill within 2 min returns data', () => {
      const tx = createMockTx({
        amount: -50,
        payee: 'Fresh Tx',
      });
      const prefill = buildPrefill(tx);
      writePrefill(prefill);

      const result = readAndClearPrefill(Date.now() + 60000);
      expect(result).not.toBeNull();
      expect(result?.payee).toBe('Fresh Tx');
    });

    it('clears storage after successful read', () => {
      const tx = createMockTx();
      const prefill = buildPrefill(tx);
      writePrefill(prefill);

      readAndClearPrefill(Date.now());
      expect(mockSessionStorage.getItem('finlynq:tx-prefill')).toBeNull();
    });
  });
});

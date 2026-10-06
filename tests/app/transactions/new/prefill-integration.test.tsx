import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import * as prefillModule from '@/lib/transactions/prefill';

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

describe('Prefill Integration - Transaction New Page', () => {
  beforeEach(() => {
    mockSessionStorage.clear();
    Object.defineProperty(global, 'window', {
      value: { sessionStorage: mockSessionStorage },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(global, 'sessionStorage', {
      value: mockSessionStorage,
      writable: true,
      configurable: true,
    });
  });

  describe('readAndClearPrefill', () => {
    it('reads prefilled data and applies to form', () => {
      const prefillData: prefillModule.PrefillData = {
        v: 1,
        amount: '50.00',
        accountId: '1',
        categoryId: '10',
        payee: 'Test Payee',
        note: 'Test Note',
        tags: 'test,tag',
        isBusiness: true,
        txType: 'Expense',
        ts: Date.now(),
      };

      mockSessionStorage.setItem('finlynq:tx-prefill', JSON.stringify(prefillData));

      const result = prefillModule.readAndClearPrefill(Date.now());
      expect(result).toEqual(prefillData);
      expect(result?.amount).toBe('50.00');
      expect(result?.payee).toBe('Test Payee');
      expect(result?.isBusiness).toBe(true);
    });

    it('returns null if prefill data is expired', () => {
      const prefillData: prefillModule.PrefillData = {
        v: 1,
        amount: '50.00',
        accountId: '1',
        categoryId: '10',
        payee: 'Old Payee',
        note: '',
        tags: '',
        isBusiness: false,
        txType: 'Expense',
        ts: Date.now() - (3 * 60 * 1000), // 3 minutes ago
      };

      mockSessionStorage.setItem('finlynq:tx-prefill', JSON.stringify(prefillData));

      const result = prefillModule.readAndClearPrefill(Date.now());
      expect(result).toBeNull();
    });

    it('returns null if malformed JSON', () => {
      mockSessionStorage.setItem('finlynq:tx-prefill', 'not valid json');
      const result = prefillModule.readAndClearPrefill(Date.now());
      expect(result).toBeNull();
    });

    it('clears sessionStorage after reading', () => {
      const prefillData: prefillModule.PrefillData = {
        v: 1,
        amount: '50.00',
        accountId: '1',
        categoryId: '10',
        payee: 'Test',
        note: '',
        tags: '',
        isBusiness: false,
        txType: 'Income',
        ts: Date.now(),
      };

      mockSessionStorage.setItem('finlynq:tx-prefill', JSON.stringify(prefillData));
      prefillModule.readAndClearPrefill(Date.now());

      expect(mockSessionStorage.getItem('finlynq:tx-prefill')).toBeNull();
    });
  });

  describe('writePrefill', () => {
    it('writes prefill data to sessionStorage', () => {
      const prefillData: prefillModule.PrefillData = {
        v: 1,
        amount: '100.00',
        accountId: '2',
        categoryId: '20',
        payee: 'Write Test',
        note: 'Testing write',
        tags: 'write',
        isBusiness: false,
        txType: 'Expense',
        ts: Date.now(),
      };

      prefillModule.writePrefill(prefillData);

      const stored = mockSessionStorage.getItem('finlynq:tx-prefill');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.payee).toBe('Write Test');
      expect(parsed.amount).toBe('100.00');
    });
  });

  describe('buildPrefill', () => {
    it('excludes sensitive fields from prefill', () => {
      const mockTx = {
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
        payee: 'Restaurant',
        note: 'Dinner',
        tags: 'dining',
        isBusiness: 0,
        quantity: null,
        portfolioHolding: null,
        portfolioHoldingSymbol: null,
        linkId: 'link123',
        tradeLinkId: null,
        kind: null,
        source: 'import',
        importHash: 'hash123',
        reconciled: 0,
        createdAt: '2026-10-06T10:00:00Z',
        updatedAt: '2026-10-06T10:00:00Z',
      };

      const prefill = prefillModule.buildPrefill(mockTx as any);

      // Should not have these fields
      expect((prefill as any).id).toBeUndefined();
      expect((prefill as any).linkId).toBeUndefined();
      expect((prefill as any).importHash).toBeUndefined();
      expect((prefill as any).createdAt).toBeUndefined();
      expect((prefill as any).source).toBeUndefined();
    });
  });

  describe('canDuplicate', () => {
    it('returns false for transfer legs', () => {
      const transferTx = {
        linkId: 'link123',
      };
      const result = prefillModule.canDuplicate(transferTx as any, 'USD');
      expect(result).toBe(false);
    });

    it('returns false for investments with kind', () => {
      const investmentTx = {
        kind: 'buy',
        linkId: null,
        tradeLinkId: null,
        quantity: null,
      };
      const result = prefillModule.canDuplicate(investmentTx as any, 'USD');
      expect(result).toBe(false);
    });

    it('returns false for multi-currency mismatch', () => {
      const multiCurrencyTx = {
        enteredCurrency: 'EUR',
        linkId: null,
        tradeLinkId: null,
        kind: null,
        quantity: null,
      };
      const result = prefillModule.canDuplicate(multiCurrencyTx as any, 'USD');
      expect(result).toBe(false);
    });

    it('returns true for plain expense transaction', () => {
      const plainTx = {
        linkId: null,
        tradeLinkId: null,
        kind: null,
        quantity: null,
        enteredCurrency: 'USD',
      };
      const result = prefillModule.canDuplicate(plainTx as any, 'USD');
      expect(result).toBe(true);
    });
  });
});

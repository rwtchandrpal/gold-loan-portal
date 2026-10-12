import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useQuotes, validateQuoteInputs } from './useQuotes.js';
import { api } from '../api/client.js';
import type { LoanScheme, QuoteResponse } from '../types/api.js';

vi.mock('../api/client.js', () => ({
  api: {
    getQuote: vi.fn(),
  },
}));

describe('useQuotes Hook & Validation (BUG-01 & BUG-08)', () => {
  const mockSchemes: LoanScheme[] = [
    {
      id: 'PLAN_BULLET_01',
      name: 'Bullet Repayment',
      interestRateAnnual: 10.5,
      maxLtv: 0.7,
      tenureMonths: 12,
      description: 'Bullet scheme',
      isActive: true,
    },
    {
      id: 'PLAN_EMI_01',
      name: 'Monthly EMI',
      interestRateAnnual: 9.5,
      maxLtv: 0.75,
      tenureMonths: 24,
      description: 'EMI scheme',
      isActive: true,
    },
  ];

  const mockQuote: QuoteResponse = {
    pureGoldGrams: 41.25,
    goldValueRupees: 288750,
    goldValuePaise: 28875000,
    eligibleLoanRupees: 216562,
    eligibleLoanPaise: 21656200,
    currency: 'INR',
    appliedLtv: 0.75,
    appliedRatePerGram24K: 7000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getQuote as any).mockResolvedValue(mockQuote);
  });

  describe('validateQuoteInputs', () => {
    it('accepts valid weights and karats', () => {
      const res = validateQuoteInputs('50.00', '45.00', 22);
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });

    it('rejects cleared/empty net weight', () => {
      const res = validateQuoteInputs('50.00', '', 22);
      expect(res.isValid).toBe(false);
      expect(res.errors.netWeight).toBe('Net weight is required');
    });

    it('rejects net weight greater than gross weight', () => {
      const res = validateQuoteInputs('50.00', '55.00', 22);
      expect(res.isValid).toBe(false);
      expect(res.errors.netWeight).toBe('Net weight cannot exceed gross weight');
    });

    it('rejects zero and negative weights', () => {
      expect(validateQuoteInputs('0', '45.00', 22).isValid).toBe(false);
      expect(validateQuoteInputs('-10', '45.00', 22).isValid).toBe(false);
      expect(validateQuoteInputs('50.00', '0', 22).isValid).toBe(false);
    });

    it('rejects weights exceeding 1000g', () => {
      expect(validateQuoteInputs('1050.00', '50.00', 22).isValid).toBe(false);
      expect(validateQuoteInputs('50.00', '1005.00', 22).isValid).toBe(false);
    });

    it('rejects more than 2 decimal places', () => {
      expect(validateQuoteInputs('50.123', '45.00', 22).isValid).toBe(false);
      expect(validateQuoteInputs('50.00', '45.999', 22).isValid).toBe(false);
    });

    it('rejects invalid karat purity', () => {
      expect(validateQuoteInputs('50.00', '45.00', 20).isValid).toBe(false);
      expect(validateQuoteInputs('50.00', '45.00', 14).isValid).toBe(false);
    });
  });

  describe('Request Cancellation & Concurrency (BUG-08)', () => {
    it('passes AbortSignal to api.getQuote and cancels superseded in-flight requests', async () => {
      let abortSignalObserved: AbortSignal | undefined;

      (api.getQuote as any).mockImplementation((_req: any, signal?: AbortSignal) => {
        abortSignalObserved = signal;
        return new Promise((resolve) => {
          setTimeout(() => resolve(mockQuote), 100);
        });
      });

      const { rerender } = renderHook(
        ({ gross, net, karat }) =>
          useQuotes({
            grossWeight: gross,
            netWeight: net,
            karat,
            schemes: mockSchemes,
          }),
        { initialProps: { gross: '50.00', net: '45.00', karat: 22 } }
      );

      // Wait for debounce and fetch
      await waitFor(() => {
        expect(api.getQuote).toHaveBeenCalled();
      });

      expect(abortSignalObserved).toBeDefined();
      expect(abortSignalObserved?.aborted).toBe(false);

      // Now change inputs while request is pending
      rerender({ gross: '60.00', net: '55.00', karat: 24 });

      // After change, the previous signal must be aborted
      await waitFor(() => {
        expect(abortSignalObserved?.aborted).toBe(true);
      });
    });

    it('Scenario C: latest request wins when earlier request completes later (stale response protection)', async () => {
      const resolversA: Array<() => void> = [];
      const resolversB: Array<() => void> = [];

      const quoteA: QuoteResponse = { ...mockQuote, eligibleLoanRupees: 100000 };
      const quoteB: QuoteResponse = { ...mockQuote, eligibleLoanRupees: 200000 };

      (api.getQuote as any).mockImplementation((req: any) => {
        if (req.netWeightGrams === 40) {
          return new Promise((resolve) => {
            resolversA.push(() => resolve(quoteA));
          });
        }
        if (req.netWeightGrams === 45) {
          return new Promise((resolve) => {
            resolversB.push(() => resolve(quoteB));
          });
        }
        return Promise.resolve(mockQuote);
      });

      const { result, rerender } = renderHook(
        ({ net }) =>
          useQuotes({
            grossWeight: '50.00',
            netWeight: net,
            karat: 22,
            schemes: mockSchemes,
          }),
        { initialProps: { net: '40.00' } }
      );

      await waitFor(() => {
        expect(api.getQuote).toHaveBeenCalled();
      });

      // Change net weight to 45.00 (triggers request B)
      rerender({ net: '45.00' });

      // Wait until request B has been dispatched for both schemes
      await waitFor(() => {
        expect(resolversB.length).toBe(2);
      });

      // Request B resolves first with quoteB
      act(() => {
        resolversB.forEach((res) => res());
      });

      await waitFor(() => {
        expect(result.current.quotesByPlan['PLAN_EMI_01']?.eligibleLoanRupees).toBe(200000);
      });

      // Request A resolves later with stale quoteA
      act(() => {
        resolversA.forEach((res) => res());
      });

      // Quote B must remain active and not be overwritten by stale request A!
      expect(result.current.quotesByPlan['PLAN_EMI_01']?.eligibleLoanRupees).toBe(200000);
    });

    it('Scenario D: disposes component and aborts pending requests cleanly without errors', async () => {
      let abortSignalObserved: AbortSignal | undefined;

      (api.getQuote as any).mockImplementation((_req: any, signal?: AbortSignal) => {
        abortSignalObserved = signal;
        return new Promise(() => {}); // never resolves
      });

      const { unmount } = renderHook(() =>
        useQuotes({
          grossWeight: '50.00',
          netWeight: '45.00',
          karat: 22,
          schemes: mockSchemes,
        })
      );

      await waitFor(() => {
        expect(api.getQuote).toHaveBeenCalled();
      });

      unmount();

      expect(abortSignalObserved?.aborted).toBe(true);
    });
  });

  describe('Stale Quote Prevention & Progression Blocking (BUG-01)', () => {
    it('Scenario A: clears quote and sets error when net weight is cleared after successful quote', async () => {
      const { result, rerender } = renderHook(
        ({ net }) =>
          useQuotes({
            grossWeight: '50.00',
            netWeight: net,
            karat: 22,
            schemes: mockSchemes,
          }),
        { initialProps: { net: '45.00' } }
      );

      await waitFor(() => {
        expect(result.current.isValid).toBe(true);
        expect(result.current.quotesByPlan['PLAN_EMI_01']).toBeDefined();
      });

      // Clear net weight
      rerender({ net: '' });

      // Instant validation feedback & immediate quote invalidation
      expect(result.current.isValid).toBe(false);
      expect(result.current.validationErrors.netWeight).toBe('Net weight is required');
      expect(result.current.quotesByPlan).toEqual({});
    });

    it('Scenario B: clears quote and blocks progression when net weight exceeds gross weight', async () => {
      const { result, rerender } = renderHook(
        ({ net }) =>
          useQuotes({
            grossWeight: '50.00',
            netWeight: net,
            karat: 22,
            schemes: mockSchemes,
          }),
        { initialProps: { net: '45.00' } }
      );

      await waitFor(() => {
        expect(result.current.quotesByPlan['PLAN_EMI_01']).toBeDefined();
      });

      // Set net > gross (55g > 50g)
      rerender({ net: '55.00' });

      expect(result.current.isValid).toBe(false);
      expect(result.current.validationErrors.netWeight).toBe('Net weight cannot exceed gross weight');
      expect(result.current.quotesByPlan).toEqual({});
    });

    it('Scenario F: handles genuine API failure and restores working quote upon retry', async () => {
      (api.getQuote as any).mockRejectedValueOnce(new Error('Market price feed offline'));

      const { result } = renderHook(() =>
        useQuotes({
          grossWeight: '50.00',
          netWeight: '45.00',
          karat: 22,
          schemes: mockSchemes,
        })
      );

      await waitFor(() => {
        expect(result.current.quoteError).toBe('Market price feed offline');
        expect(result.current.quotesByPlan).toEqual({});
      });

      // Now mock successful recovery
      (api.getQuote as any).mockResolvedValue(mockQuote);

      act(() => {
        result.current.refetchQuotes();
      });

      await waitFor(() => {
        expect(result.current.quoteError).toBeNull();
        expect(result.current.quotesByPlan['PLAN_EMI_01']).toBeDefined();
      });
    });
  });
});

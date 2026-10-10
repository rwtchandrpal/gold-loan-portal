import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  DEFAULT_MOCK_GOLD_RATE_24K,
  MAX_REGULATORY_LTV,
  LOAN_SCHEME_IDS,
} from '../../src/core/constants.js';
import {
  calculateFinancialQuote,
  validateCalculationInput,
} from '../../src/core/financial-maths.js';
import { QuoteService } from '../../src/services/quote.service.js';
import { prisma } from '../../src/config/db.js';

describe('Financial Calculation Engine (Phase 2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Page 4 Mandatory Reference Test Cases', () => {
    it('Reference Case 1: 45g net, 22K, Monthly EMI (75% LTV) -> Pure 41.25g, Value ₹2,88,750, Loan ₹2,16,562', () => {
      const result = calculateFinancialQuote({
        netWeightGrams: 45,
        grossWeightGrams: 50,
        karat: 22,
        maxLtv: 0.75,
      });

      // Pure gold: 45 * 22 / 24 = 41.25 g
      expect(result.pureGoldGrams).toBe(41.25);
      expect(result.pureGoldGramsDecimal.toString()).toBe('41.25');

      // Unrounded gold value: 41.25 * 7000 = 288750
      expect(result.unroundedGoldValueRupees.toString()).toBe('288750');

      // Gold value in rupees and paise: ₹2,88,750 / 28,875,000 paise
      expect(result.goldValueRupees).toBe(288750);
      expect(result.goldValuePaise).toBe(28875000n);

      // Effective LTV: min(0.75, 0.75) = 0.75
      expect(result.effectiveLtv).toBe(0.75);

      // Eligible loan: floor(288750 * 0.75) = floor(216562.5) = 216562
      expect(result.eligibleLoanRupees).toBe(216562);
      expect(result.eligibleLoanPaise).toBe(21656200n);

      expect(result.appliedRatePerGram24K).toBe(7000);
      expect(result.currency).toBe('INR');
    });

    it('Reference Case 2: 45g net, 22K, Bullet Repayment (70% LTV) -> Value ₹2,88,750, Loan ₹2,02,125', () => {
      const result = calculateFinancialQuote({
        netWeightGrams: 45,
        grossWeightGrams: 50,
        karat: 22,
        maxLtv: 0.70,
      });

      expect(result.pureGoldGrams).toBe(41.25);
      expect(result.goldValueRupees).toBe(288750);
      expect(result.goldValuePaise).toBe(28875000n);

      expect(result.effectiveLtv).toBe(0.70);

      // Eligible loan: floor(288750 * 0.70) = floor(202125) = 202125
      expect(result.eligibleLoanRupees).toBe(202125);
      expect(result.eligibleLoanPaise).toBe(20212500n);
    });

    it('Reference Case 3: 10g net, 18K, Monthly EMI (75% LTV) -> Pure 7.5g, Value ₹52,500, Loan ₹39,375', () => {
      const result = calculateFinancialQuote({
        netWeightGrams: 10,
        grossWeightGrams: 12,
        karat: 18,
        maxLtv: 0.75,
      });

      // Pure gold: 10 * 18 / 24 = 7.5 g
      expect(result.pureGoldGrams).toBe(7.5);

      // Value: 7.5 * 7000 = 52500
      expect(result.goldValueRupees).toBe(52500);
      expect(result.goldValuePaise).toBe(5250000n);

      // Loan: floor(52500 * 0.75) = 39375
      expect(result.eligibleLoanRupees).toBe(39375);
      expect(result.eligibleLoanPaise).toBe(3937500n);
    });
  });

  describe('24K Benchmark Calculations', () => {
    it('10g net, 24K, EMI (75% LTV) -> Pure 10g, Value ₹70,000, Loan ₹52,500', () => {
      const result = calculateFinancialQuote({
        netWeightGrams: 10,
        karat: 24,
        maxLtv: 0.75,
      });

      expect(result.pureGoldGrams).toBe(10);
      expect(result.goldValueRupees).toBe(70000);
      expect(result.goldValuePaise).toBe(7000000n);
      expect(result.eligibleLoanRupees).toBe(52500);
      expect(result.eligibleLoanPaise).toBe(5250000n);
    });

    it('10g net, 24K, Bullet (70% LTV) -> Pure 10g, Value ₹70,000, Loan ₹49,000', () => {
      const result = calculateFinancialQuote({
        netWeightGrams: 10,
        karat: 24,
        maxLtv: 0.70,
      });

      expect(result.pureGoldGrams).toBe(10);
      expect(result.goldValueRupees).toBe(70000);
      expect(result.eligibleLoanRupees).toBe(49000);
      expect(result.eligibleLoanPaise).toBe(4900000n);
    });
  });

  describe('Floor Behavior & Mathematical Precision', () => {
    it('strictly floors loan rupees downwards rather than rounding up', () => {
      // 45g, 22K, 75% LTV generates 216562.5 unrounded rupees
      const result = calculateFinancialQuote({
        netWeightGrams: 45,
        karat: 22,
        maxLtv: 0.75,
      });

      // 216562.5 MUST be floored to 216562, NOT rounded to 216563
      expect(result.eligibleLoanRupees).toBe(216562);
      expect(result.eligibleLoanRupees).not.toBe(216563);
      expect(result.eligibleLoanPaise).toBe(21656200n);
    });

    it('floors fractional loan rupees for repeating decimals', () => {
      // 15.5g net, 22K, 70% LTV
      // Pure: 15.5 * 22 / 24 = 14.208333... g
      // Value: 14.208333... * 7000 = 99458.333... rupees
      // Loan: 99458.333... * 0.70 = 69620.833... rupees
      const result = calculateFinancialQuote({
        netWeightGrams: 15.5,
        karat: 22,
        maxLtv: 0.70,
      });

      expect(result.eligibleLoanRupees).toBe(69620);
      expect(result.eligibleLoanRupees).not.toBe(69621);
      expect(result.eligibleLoanPaise).toBe(6962000n);
    });

    it('calculates eligible loan from UNROUNDED gold value to avoid intermediate loss', () => {
      // 1.01g net, 22K, 75% LTV
      // Pure gold: 1.01 * 22 / 24 = 0.925833333333...
      // Unrounded value: 0.925833333333... * 7000 = 6480.83333333...
      // Loan: 6480.83333333... * 0.75 = 4860.625 -> floor = 4860
      const result = calculateFinancialQuote({
        netWeightGrams: 1.01,
        karat: 22,
        maxLtv: 0.75,
      });

      expect(result.eligibleLoanRupees).toBe(4860);
      expect(result.eligibleLoanPaise).toBe(486000n);
      expect(result.goldValuePaise).toBe(648083n); // 6480.8333... rounded half-up to nearest paise
      expect(result.goldValueRupees).toBe(6480.83);
    });

    it('guarantees goldValueRupees is exactly consistent with goldValuePaise / 100', () => {
      const result = calculateFinancialQuote({
        netWeightGrams: 33.33,
        karat: 22,
        maxLtv: 0.75,
      });

      const derivedFromPaise = Number(result.goldValuePaise) / 100;
      expect(result.goldValueRupees).toBe(derivedFromPaise);
    });
  });

  describe('Regulatory LTV Cap Enforcement (75%)', () => {
    it('caps LTV at 0.75 when plan requests 0.80', () => {
      const result = calculateFinancialQuote({
        netWeightGrams: 10,
        karat: 24,
        maxLtv: 0.80, // Above regulatory ceiling
      });

      expect(result.effectiveLtv).toBe(MAX_REGULATORY_LTV);
      expect(result.effectiveLtv).toBe(0.75);
      // Value: 70000, 75% loan: 52500 (not 80% = 56000)
      expect(result.eligibleLoanRupees).toBe(52500);
    });

    it('caps LTV at 0.75 when plan requests 0.90 or 1.00', () => {
      const result90 = calculateFinancialQuote({
        netWeightGrams: 10,
        karat: 24,
        maxLtv: 0.90,
      });
      expect(result90.effectiveLtv).toBe(0.75);
      expect(result90.eligibleLoanRupees).toBe(52500);

      const result100 = calculateFinancialQuote({
        netWeightGrams: 10,
        karat: 24,
        maxLtv: 1.00,
      });
      expect(result100.effectiveLtv).toBe(0.75);
      expect(result100.eligibleLoanRupees).toBe(52500);
    });

    it('respects LTV lower than 0.75 without alteration', () => {
      const result = calculateFinancialQuote({
        netWeightGrams: 10,
        karat: 24,
        maxLtv: 0.60,
      });

      expect(result.effectiveLtv).toBe(0.60);
      expect(result.eligibleLoanRupees).toBe(42000);
    });
  });

  describe('Input Precision & Boundary Tolerances', () => {
    it('supports boundary minimum weight of 0.01g', () => {
      const result = calculateFinancialQuote({
        netWeightGrams: 0.01,
        karat: 24,
        maxLtv: 0.75,
      });

      expect(result.pureGoldGrams).toBe(0.01);
      expect(result.goldValueRupees).toBe(70);
      expect(result.goldValuePaise).toBe(7000n);
      expect(result.eligibleLoanRupees).toBe(52); // floor(70 * 0.75) = 52.5 -> 52
      expect(result.eligibleLoanPaise).toBe(5200n);
    });

    it('supports boundary maximum weight of 1000.00g', () => {
      const result = calculateFinancialQuote({
        netWeightGrams: 1000,
        karat: 24,
        maxLtv: 0.75,
      });

      expect(result.pureGoldGrams).toBe(1000);
      expect(result.goldValueRupees).toBe(7000000);
      expect(result.goldValuePaise).toBe(700000000n);
      expect(result.eligibleLoanRupees).toBe(5250000);
      expect(result.eligibleLoanPaise).toBe(525000000n);
    });

    it('accepts string inputs cleanly without floating-point conversion loss', () => {
      const result = calculateFinancialQuote({
        netWeightGrams: '45.00',
        grossWeightGrams: '50.00',
        karat: 22,
        maxLtv: '0.75',
        goldRatePerGram24K: '7000',
      });

      expect(result.pureGoldGrams).toBe(41.25);
      expect(result.eligibleLoanRupees).toBe(216562);
    });

    it('accepts Decimal inputs cleanly', () => {
      const result = calculateFinancialQuote({
        netWeightGrams: new Decimal('45'),
        karat: 22,
        maxLtv: new Decimal('0.75'),
      });

      expect(result.pureGoldGrams).toBe(41.25);
      expect(result.eligibleLoanRupees).toBe(216562);
    });
  });

  describe('Validation of Domain Constraints', () => {
    it('throws when netWeightGrams <= 0', () => {
      expect(() =>
        calculateFinancialQuote({ netWeightGrams: 0, karat: 22, maxLtv: 0.75 })
      ).toThrowError(/Net weight must be greater than 0 grams/);

      expect(() =>
        calculateFinancialQuote({ netWeightGrams: -5, karat: 22, maxLtv: 0.75 })
      ).toThrowError(/Net weight must be greater than 0 grams/);
    });

    it('throws when netWeightGrams > 1000', () => {
      expect(() =>
        calculateFinancialQuote({ netWeightGrams: 1000.01, karat: 22, maxLtv: 0.75 })
      ).toThrowError(/Net weight cannot exceed 1000 grams/);
    });

    it('throws when grossWeightGrams < netWeightGrams', () => {
      expect(() =>
        calculateFinancialQuote({
          netWeightGrams: 45,
          grossWeightGrams: 40,
          karat: 22,
          maxLtv: 0.75,
        })
      ).toThrowError(/Gross weight .* cannot be less than net weight/);
    });

    it('throws when karat is not in [18, 22, 24]', () => {
      expect(() =>
        calculateFinancialQuote({ netWeightGrams: 10, karat: 14, maxLtv: 0.75 })
      ).toThrowError(/Invalid karat purity: 14/);

      expect(() =>
        calculateFinancialQuote({ netWeightGrams: 10, karat: 21, maxLtv: 0.75 })
      ).toThrowError(/Invalid karat purity: 21/);

      expect(() =>
        calculateFinancialQuote({ netWeightGrams: 10, karat: 25, maxLtv: 0.75 })
      ).toThrowError(/Invalid karat purity: 25/);
    });

    it('throws when maxLtv <= 0', () => {
      expect(() =>
        calculateFinancialQuote({ netWeightGrams: 10, karat: 22, maxLtv: 0 })
      ).toThrowError(/Plan max LTV must be a positive ratio/);
    });
  });

  describe('Independence from Environment Variables', () => {
    it('uses fixed DEFAULT_MOCK_GOLD_RATE_24K = 7000 regardless of env variables', () => {
      const originalEnv = process.env.MOCK_GOLD_RATE_24K;
      try {
        process.env.MOCK_GOLD_RATE_24K = '99999';

        const result = calculateFinancialQuote({
          netWeightGrams: 10,
          karat: 24,
          maxLtv: 0.75,
        });

        // Must still use 7000 as default rate
        expect(result.appliedRatePerGram24K).toBe(7000);
        expect(result.goldValueRupees).toBe(70000);
      } finally {
        process.env.MOCK_GOLD_RATE_24K = originalEnv;
      }
    });
  });

  describe('QuoteService Integration & Lead Non-Persistence', () => {
    it('QuoteService calculates quote via selectedPlanId (PLAN_EMI_01 -> 0.75 LTV)', () => {
      const result = QuoteService.calculateQuote({
        netWeightGrams: 45,
        karat: 22,
        selectedPlanId: LOAN_SCHEME_IDS.EMI,
      });

      expect(result.pureGoldGrams).toBe(41.25);
      expect(result.goldValueRupees).toBe(288750);
      expect(result.eligibleLoanRupees).toBe(216562);
      expect(result.effectiveLtv).toBe(0.75);
    });

    it('QuoteService calculates quote via selectedPlanId (PLAN_BULLET_01 -> 0.70 LTV)', () => {
      const result = QuoteService.calculateQuote({
        netWeightGrams: 45,
        karat: 22,
        selectedPlanId: LOAN_SCHEME_IDS.BULLET,
      });

      expect(result.pureGoldGrams).toBe(41.25);
      expect(result.goldValueRupees).toBe(288750);
      expect(result.eligibleLoanRupees).toBe(202125);
      expect(result.effectiveLtv).toBe(0.70);
    });

    it('CRITICAL: QuoteService is pure and does NOT insert leads into the database', async () => {
      // 1. Check existing leads count before calculation
      const initialCount = await prisma.lead.count();

      // 2. Spy on prisma.lead methods
      const createSpy = vi.spyOn(prisma.lead, 'create');
      const createManySpy = vi.spyOn(prisma.lead, 'createMany');

      // 3. Perform multiple quote calculations
      QuoteService.calculateQuote({
        netWeightGrams: 45,
        grossWeightGrams: 50,
        karat: 22,
        selectedPlanId: LOAN_SCHEME_IDS.EMI,
      });

      QuoteService.calculateQuote({
        netWeightGrams: 10,
        grossWeightGrams: 12,
        karat: 18,
        selectedPlanId: LOAN_SCHEME_IDS.BULLET,
      });

      // 4. Verify create was never called
      expect(createSpy).not.toHaveBeenCalled();
      expect(createManySpy).not.toHaveBeenCalled();

      // 5. Verify database leads count remains unchanged
      const finalCount = await prisma.lead.count();
      expect(finalCount).toBe(initialCount);
    });
  });
});

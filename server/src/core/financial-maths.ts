import { Decimal } from 'decimal.js';
import {
  DEFAULT_MOCK_GOLD_RATE_24K,
  MAX_REGULATORY_LTV,
  ALLOWED_KARATS,
  MIN_WEIGHT_GRAMS,
  MAX_WEIGHT_GRAMS,
  type AllowedKarat,
} from './constants.js';

// Configure high internal precision for financial computations
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/**
 * ============================================================================
 * GOLD LOAN PORTAL - FINANCIAL CALCULATION ENGINE & ROUNDING POLICY
 * ============================================================================
 * 
 * 1. PURE GOLD (Grams):
 *    pureGoldGrams = netWeightGrams * (karat / 24)
 *    - Maintained using Decimal precision (up to 28 significant digits).
 *    - Database persistence uses PostgreSQL DECIMAL(10, 4).
 *    - Exposed as a standard number rounded to 4 decimal places for API responses.
 * 
 * 2. UNROUNDED GOLD VALUE (INR):
 *    unroundedGoldValueRupees = pureGoldGrams * goldRatePerGram24K
 *    - Benchmark rate: DEFAULT_MOCK_GOLD_RATE_24K = ₹7,000 / gram (Page 4).
 *    - Calculated directly as (netWeightGrams * karat * goldRatePerGram24K) / 24.
 *    - Maintained without intermediate rounding to prevent compounding errors.
 * 
 * 3. GOLD VALUE STORAGE & DISPLAY ROUNDING POLICY (Paise & Rupees):
 *    - Persistence: Stored as exact integer paise (BigInt gold_value_paise).
 *    - Rounding Method: Half-Up Rounding (ROUND_HALF_UP) applied at the paise boundary:
 *        goldValuePaise = BigInt(round_half_up(unroundedGoldValueRupees * 100))
 *    - Rupee Representation: Exactly aligned with stored paise:
 *        goldValueRupees = Number(goldValuePaise) / 100
 *    - Guaranteed consistency: goldValueRupees * 100 === Number(goldValuePaise).
 * 
 * 4. ELIGIBLE LOAN AMOUNT (Rupees & Paise):
 *    - Regulatory Ceiling: effectiveLtv = min(plan.maxLtv, 0.75) (RBI 75% LTV ceiling).
 *    - Source of Truth: Calculated strictly from UNROUNDED gold value:
 *        unroundedLoanRupees = unroundedGoldValueRupees * effectiveLtv
 *    - Floor Policy: Strictly floored to whole rupees using Decimal.floor():
 *        eligibleLoanRupees = floor(unroundedLoanRupees)
 *    - Integer Paise Conversion: Converted to paise only AFTER flooring:
 *        eligibleLoanPaise = BigInt(eligibleLoanRupees) * 100n
 *    - Guaranteed zero fractional paise and zero floating-point error.
 * ============================================================================
 */

export interface FinancialCalculationInput {
  grossWeightGrams?: number | string | Decimal;
  netWeightGrams: number | string | Decimal;
  karat: number;
  maxLtv: number | string | Decimal;
  goldRatePerGram24K?: number | string | Decimal;
}

export interface FinancialCalculationResult {
  /** Derived pure gold in grams, rounded to 4 decimal places for API and DB (e.g. 41.25) */
  pureGoldGrams: number;
  /** High-precision Decimal representation of pure gold */
  pureGoldGramsDecimal: Decimal;

  /** Unrounded gold value in Rupees before any rounding */
  unroundedGoldValueRupees: Decimal;

  /** Exact monetary integer in paise for persistence (BigInt) */
  goldValuePaise: bigint;
  /** Gold value in Rupees derived from goldValuePaise / 100 */
  goldValueRupees: number;

  /** Effective LTV ratio after applying the regulatory 75% ceiling */
  effectiveLtv: number;
  /** Effective LTV Decimal representation */
  effectiveLtvDecimal: Decimal;

  /** Eligible loan in whole Rupees, strictly floored */
  eligibleLoanRupees: number;
  /** Eligible loan in exact integer paise (eligibleLoanRupees * 100n) */
  eligibleLoanPaise: bigint;

  /** Benchmark gold rate applied in ₹ / gram */
  appliedRatePerGram24K: number;
  /** Currency identifier */
  currency: 'INR';
}

/**
 * Validates calculation inputs according to domain bounds.
 */
export function validateCalculationInput(input: FinancialCalculationInput): void {
  const netWeight = new Decimal(input.netWeightGrams);
  if (netWeight.isNaN() || netWeight.lte(0)) {
    throw new Error(`Net weight must be greater than 0 grams. Received: ${input.netWeightGrams}`);
  }
  if (netWeight.gt(MAX_WEIGHT_GRAMS)) {
    throw new Error(`Net weight cannot exceed ${MAX_WEIGHT_GRAMS} grams. Received: ${input.netWeightGrams}`);
  }

  if (input.grossWeightGrams !== undefined) {
    const grossWeight = new Decimal(input.grossWeightGrams);
    if (grossWeight.isNaN() || grossWeight.lt(netWeight)) {
      throw new Error(
        `Gross weight (${input.grossWeightGrams}) cannot be less than net weight (${input.netWeightGrams})`
      );
    }
    if (grossWeight.gt(MAX_WEIGHT_GRAMS)) {
      throw new Error(`Gross weight cannot exceed ${MAX_WEIGHT_GRAMS} grams. Received: ${input.grossWeightGrams}`);
    }
  }

  if (!ALLOWED_KARATS.includes(input.karat as AllowedKarat)) {
    throw new Error(
      `Invalid karat purity: ${input.karat}. Allowed karats are: ${ALLOWED_KARATS.join(', ')}`
    );
  }

  const ltv = new Decimal(input.maxLtv);
  if (ltv.isNaN() || ltv.lte(0)) {
    throw new Error(`Plan max LTV must be a positive ratio. Received: ${input.maxLtv}`);
  }

  if (input.goldRatePerGram24K !== undefined) {
    const rate = new Decimal(input.goldRatePerGram24K);
    if (rate.isNaN() || rate.lte(0)) {
      throw new Error(`Gold rate must be positive. Received: ${input.goldRatePerGram24K}`);
    }
  }
}

/**
 * Pure mathematical calculation engine for gold loan quotes.
 * 
 * - Zero HTTP coupling
 * - Zero database reads or writes
 * - 100% precise decimal arithmetic
 */
export function calculateFinancialQuote(
  input: FinancialCalculationInput
): FinancialCalculationResult {
  validateCalculationInput(input);

  const netWeight = new Decimal(input.netWeightGrams);
  const karat = new Decimal(input.karat);
  const rawRate = input.goldRatePerGram24K !== undefined
    ? new Decimal(input.goldRatePerGram24K)
    : new Decimal(DEFAULT_MOCK_GOLD_RATE_24K);

  // 1. Pure gold grams: netWeight * (karat / 24)
  const pureGoldGramsDecimal = netWeight.mul(karat).div(24);
  const pureGoldGrams = Number(pureGoldGramsDecimal.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4));

  // 2. Unrounded gold value: pureGoldGrams * goldRate
  const unroundedGoldValueRupees = pureGoldGramsDecimal.mul(rawRate);

  // 3. Gold value paise policy: Half-up rounding to nearest integer paise
  const goldValuePaiseDec = unroundedGoldValueRupees
    .mul(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const goldValuePaise = BigInt(goldValuePaiseDec.toFixed(0));
  const goldValueRupees = Number(goldValuePaiseDec.div(100).toFixed(2));

  // 4. Effective LTV capped at regulatory ceiling (0.75)
  const requestedLtv = new Decimal(input.maxLtv);
  const regulatoryCeiling = new Decimal(MAX_REGULATORY_LTV);
  const effectiveLtvDecimal = Decimal.min(requestedLtv, regulatoryCeiling);
  const effectiveLtv = effectiveLtvDecimal.toNumber();

  // 5. Eligible loan amount: calculated from unrounded gold value, floored to whole rupees
  const unroundedLoanRupees = unroundedGoldValueRupees.mul(effectiveLtvDecimal);
  const eligibleLoanRupeesDec = unroundedLoanRupees.floor();
  const eligibleLoanRupees = eligibleLoanRupeesDec.toNumber();

  // 6. Integer paise conversion: whole rupees * 100n
  const eligibleLoanPaise = BigInt(eligibleLoanRupeesDec.toFixed(0)) * 100n;

  return {
    pureGoldGrams,
    pureGoldGramsDecimal,
    unroundedGoldValueRupees,
    goldValuePaise,
    goldValueRupees,
    effectiveLtv,
    effectiveLtvDecimal,
    eligibleLoanRupees,
    eligibleLoanPaise,
    appliedRatePerGram24K: rawRate.toNumber(),
    currency: 'INR',
  };
}

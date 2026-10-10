/**
 * Domain constants for the Gold Loan Portal financial engine.
 * 
 * Strict alignment with assignment specification (Page 4).
 */

/** Fixed benchmark mock rate for 24K gold in INR per gram (Page 4) */
export const DEFAULT_MOCK_GOLD_RATE_24K = 7000;

/** Maximum regulatory Loan-to-Value (LTV) ceiling per RBI gold loan guidelines (75%) */
export const MAX_REGULATORY_LTV = 0.75;

/** Accepted karat purities for hallmarked gold jewelry */
export const ALLOWED_KARATS = [18, 22, 24] as const;
export type AllowedKarat = (typeof ALLOWED_KARATS)[number];

/** Canonical identifiers for seeded loan schemes */
export const LOAN_SCHEME_IDS = {
  BULLET: 'PLAN_BULLET_01',
  EMI: 'PLAN_EMI_01',
} as const;

/** Canonical default plan LTVs */
export const DEFAULT_PLAN_LTVS: Record<string, number> = {
  [LOAN_SCHEME_IDS.BULLET]: 0.70,
  [LOAN_SCHEME_IDS.EMI]: 0.75,
};

/** Weight validation boundaries in grams */
export const MIN_WEIGHT_GRAMS = 0.01;
export const MAX_WEIGHT_GRAMS = 1000.00;

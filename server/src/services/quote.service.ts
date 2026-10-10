import { Decimal } from 'decimal.js';
import {
  DEFAULT_MOCK_GOLD_RATE_24K,
  DEFAULT_PLAN_LTVS,
  LOAN_SCHEME_IDS,
} from '../core/constants.js';
import {
  calculateFinancialQuote,
  type FinancialCalculationInput,
  type FinancialCalculationResult,
} from '../core/financial-maths.js';

export interface QuoteServiceInput {
  grossWeightGrams?: number | string | Decimal;
  netWeightGrams: number | string | Decimal;
  karat: number;
  selectedPlanId?: string;
  maxLtv?: number | string | Decimal;
  goldRatePerGram24K?: number | string | Decimal;
}

/**
 * Independent Quote Calculation Service.
 * 
 * In accordance with AGENTS.md Rule 6:
 * - Zero HTTP request or response object coupling.
 * - Zero database reads or writes.
 * - Never creates or persists leads.
 * - Directly callable by REST endpoints, the AI agent tool handler, and unit tests.
 */
export class QuoteService {
  /**
   * Calculates a gold loan quote using precise decimal arithmetic.
   * 
   * @param input Applicant weights, karat, and optional plan/LTV
   * @returns Pure financial quote results
   */
  static calculateQuote(input: QuoteServiceInput): FinancialCalculationResult {
    // Determine effective plan LTV
    let resolvedLtv: number | string | Decimal;

    if (input.maxLtv !== undefined) {
      resolvedLtv = input.maxLtv;
    } else if (input.selectedPlanId && DEFAULT_PLAN_LTVS[input.selectedPlanId] !== undefined) {
      resolvedLtv = DEFAULT_PLAN_LTVS[input.selectedPlanId];
    } else {
      // Default to standard EMI 75% LTV if not explicitly specified
      resolvedLtv = DEFAULT_PLAN_LTVS[LOAN_SCHEME_IDS.EMI] ?? 0.75;
    }

    const calculationInput: FinancialCalculationInput = {
      grossWeightGrams: input.grossWeightGrams,
      netWeightGrams: input.netWeightGrams,
      karat: input.karat,
      maxLtv: resolvedLtv,
      goldRatePerGram24K: input.goldRatePerGram24K ?? DEFAULT_MOCK_GOLD_RATE_24K,
    };

    return calculateFinancialQuote(calculationInput);
  }
}

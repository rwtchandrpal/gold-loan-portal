import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { NotFoundError } from '../core/errors.js';
import { calculateFinancialQuote } from '../core/financial-maths.js';
import { DEFAULT_PLAN_LTVS, LOAN_SCHEME_IDS } from '../core/constants.js';
import type { QuoteRequestInput } from '../schemas/quote.schema.js';

export async function createQuote(
  req: Request<{}, {}, QuoteRequestInput>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { grossWeightGrams, netWeightGrams, karat, selectedPlanId } = req.body;

    let targetLtv = DEFAULT_PLAN_LTVS[LOAN_SCHEME_IDS.EMI] ?? 0.75;

    if (selectedPlanId) {
      const scheme = await prisma.loanScheme.findUnique({
        where: { id: selectedPlanId },
      });

      if (!scheme || !scheme.isActive) {
        throw new NotFoundError(
          `Selected loan scheme '${selectedPlanId}' does not exist or is inactive.`,
          [
            {
              field: 'selectedPlanId',
              message: `Loan scheme '${selectedPlanId}' not found or inactive`,
            },
          ],
          'PLAN_NOT_FOUND'
        );
      }

      targetLtv = Number(scheme.maxLtv);
    }

    const result = calculateFinancialQuote({
      grossWeightGrams,
      netWeightGrams,
      karat,
      maxLtv: targetLtv,
    });

    res.status(200).json({
      pureGoldGrams: result.pureGoldGrams,
      goldValueRupees: result.goldValueRupees,
      goldValuePaise: Number(result.goldValuePaise),
      eligibleLoanRupees: result.eligibleLoanRupees,
      eligibleLoanPaise: Number(result.eligibleLoanPaise),
      currency: result.currency,
      appliedLtv: result.effectiveLtv,
      appliedRatePerGram24K: result.appliedRatePerGram24K,
    });
  } catch (err) {
    next(err);
  }
}

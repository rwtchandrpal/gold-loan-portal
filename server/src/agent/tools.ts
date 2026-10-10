import { z } from 'zod';
import { ALLOWED_KARATS } from '../core/constants.js';
import { QuoteService } from '../services/quote.service.js';
import { LeadService } from '../services/lead.service.js';
import { SessionService } from '../services/session.service.js';
import { leadCreationSchema } from '../schemas/loan.schema.js';
import { DuplicateApplicationError, NotFoundError } from '../core/errors.js';

/**
 * Validation schema for calculate_quote tool
 */
export const calculateQuoteToolSchema = z
  .object({
    net: z
      .number({ invalid_type_error: 'Net weight must be a number' })
      .positive('Net weight must be greater than 0 grams')
      .max(1000, 'Net weight cannot exceed 1000 grams'),
    gross: z
      .number({ invalid_type_error: 'Gross weight must be a number' })
      .positive('Gross weight must be greater than 0 grams')
      .max(1000, 'Gross weight cannot exceed 1000 grams'),
    karat: z
      .number({ invalid_type_error: 'Karat must be a number' })
      .int('Karat must be an integer')
      .refine(
        (k) => (ALLOWED_KARATS as readonly number[]).includes(k),
        `Karat must be one of: ${ALLOWED_KARATS.join(', ')}`
      ),
  })
  .refine((data) => data.net <= data.gross, {
    message: 'Net weight cannot exceed gross weight',
    path: ['net'],
  });

export type CalculateQuoteToolInput = z.infer<typeof calculateQuoteToolSchema>;

/**
 * Function Declarations for Gemini Tool Calling
 */
export const GEMINI_TOOLS_DECLARATIONS = [
  {
    name: 'get_loan_schemes',
    description: 'Fetches the list of active gold loan schemes and interest rates from the database.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'calculate_quote',
    description:
      'Calculates gold loan eligibility, pure gold weight, gold value, and maximum loan amounts based on gold weight and karat.',
    parameters: {
      type: 'OBJECT',
      properties: {
        net: {
          type: 'NUMBER',
          description: 'Net gold weight in grams (excluding non-gold stones/enamel)',
        },
        gross: {
          type: 'NUMBER',
          description: 'Gross total gold weight in grams',
        },
        karat: {
          type: 'INTEGER',
          description: 'Gold purity karat: 18, 22, or 24',
        },
      },
      required: ['net', 'gross', 'karat'],
    },
  },
  {
    name: 'submit_application',
    description:
      'Submits a confirmed gold loan application. Note: Fails if the applicant has not confirmed the draft via the UI confirmation card.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fullName: {
          type: 'STRING',
          description: 'Full name of the applicant (English letters and spaces only, 2-60 characters)',
        },
        mobileNumber: {
          type: 'STRING',
          description: '10-digit Indian mobile number starting with 6, 7, 8, or 9',
        },
        grossWeightGrams: {
          type: 'NUMBER',
          description: 'Total gross weight in grams',
        },
        netWeightGrams: {
          type: 'NUMBER',
          description: 'Net gold weight in grams',
        },
        karat: {
          type: 'INTEGER',
          description: 'Purity in karat: 18, 22, or 24',
        },
        selectedPlanId: {
          type: 'STRING',
          description: 'Selected loan scheme ID (e.g. PLAN_EMI_01 or PLAN_BULLET_01)',
        },
      },
      required: [
        'fullName',
        'mobileNumber',
        'grossWeightGrams',
        'netWeightGrams',
        'karat',
        'selectedPlanId',
      ],
    },
  },
];

/**
 * Executes a tool call given the tool name, arguments, and session context.
 */
export async function executeToolCall(
  name: string,
  rawArgs: any,
  sessionId: string
): Promise<any> {
  switch (name) {
    case 'get_loan_schemes': {
      return await LeadService.getLoanSchemes();
    }

    case 'calculate_quote': {
      const parseResult = calculateQuoteToolSchema.safeParse(rawArgs);
      if (!parseResult.success) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: parseResult.error.errors.map((e) => e.message).join('; '),
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        };
      }

      const { net, gross, karat } = parseResult.data;

      // Calculate quotes for both available plans so the user can compare options
      const bulletQuote = QuoteService.calculateQuote({
        netWeightGrams: net,
        grossWeightGrams: gross,
        karat,
        selectedPlanId: 'PLAN_BULLET_01',
      });

      const emiQuote = QuoteService.calculateQuote({
        netWeightGrams: net,
        grossWeightGrams: gross,
        karat,
        selectedPlanId: 'PLAN_EMI_01',
      });

      // Check existing draft plan selection if user had already chosen a scheme
      const existingSession = await SessionService.getOrCreateSession(sessionId);
      const existingDraft = (existingSession.draftPayload as any) || {};
      const activePlanId = existingDraft.selectedPlanId;
      const quoteForActivePlan = activePlanId === 'PLAN_BULLET_01' ? bulletQuote : emiQuote;

      // Update authoritative session draft with quote calculations
      await SessionService.updateDraft(sessionId, {
        netWeightGrams: net,
        grossWeightGrams: gross,
        karat,
        pureGoldGrams: bulletQuote.pureGoldGrams,
        goldValueRupees: bulletQuote.goldValueRupees,
        eligibleLoanRupees: quoteForActivePlan.eligibleLoanRupees,
      });

      return {
        success: true,
        pureGoldGrams: bulletQuote.pureGoldGrams,
        goldValueRupees: bulletQuote.goldValueRupees,
        goldValuePaise: Number(bulletQuote.goldValuePaise),
        quotesByPlan: {
          PLAN_BULLET_01: {
            planName: 'Bullet Repayment (12% p.a., 70% LTV)',
            eligibleLoanRupees: bulletQuote.eligibleLoanRupees,
            maxLtv: 0.70,
          },
          PLAN_EMI_01: {
            planName: 'Monthly EMI (10.5% p.a., 75% LTV)',
            eligibleLoanRupees: emiQuote.eligibleLoanRupees,
            maxLtv: 0.75,
          },
        },
      };
    }

    case 'submit_application': {
      // 1. Mandatory Confirmation Check
      const isConfirmed = await SessionService.isDraftConfirmed(sessionId);
      if (!isConfirmed) {
        // If unconfirmed, save any model candidate args into draft so user can see & confirm them
        if (rawArgs && typeof rawArgs === 'object') {
          const candidateUpdate: Record<string, any> = {};
          if (typeof rawArgs.fullName === 'string' && rawArgs.fullName.trim()) candidateUpdate.fullName = rawArgs.fullName.trim();
          if (typeof rawArgs.mobileNumber === 'string' && rawArgs.mobileNumber.trim()) candidateUpdate.mobileNumber = rawArgs.mobileNumber.trim();
          if (typeof rawArgs.selectedPlanId === 'string' && rawArgs.selectedPlanId.trim()) candidateUpdate.selectedPlanId = rawArgs.selectedPlanId.trim();
          if (typeof rawArgs.grossWeightGrams === 'number') candidateUpdate.grossWeightGrams = rawArgs.grossWeightGrams;
          if (typeof rawArgs.netWeightGrams === 'number') candidateUpdate.netWeightGrams = rawArgs.netWeightGrams;
          if (typeof rawArgs.karat === 'number') candidateUpdate.karat = rawArgs.karat;

          if (Object.keys(candidateUpdate).length > 0) {
            if (
              candidateUpdate.netWeightGrams &&
              candidateUpdate.grossWeightGrams &&
              candidateUpdate.karat &&
              candidateUpdate.selectedPlanId
            ) {
              try {
                const q = QuoteService.calculateQuote({
                  netWeightGrams: candidateUpdate.netWeightGrams,
                  grossWeightGrams: candidateUpdate.grossWeightGrams,
                  karat: candidateUpdate.karat,
                  selectedPlanId: candidateUpdate.selectedPlanId,
                });
                candidateUpdate.pureGoldGrams = q.pureGoldGrams;
                candidateUpdate.goldValueRupees = q.goldValueRupees;
                candidateUpdate.eligibleLoanRupees = q.eligibleLoanRupees;
              } catch {
                // Quote validation errors handled downstream
              }
            }
            await SessionService.updateDraft(sessionId, candidateUpdate);
          }
        }

        return {
          success: false,
          error: 'CONFIRMATION_REQUIRED',
          message:
            'Application submission cannot proceed: user has not confirmed this application draft. Please ask the applicant to review the details and click the "Confirm & Submit" button on screen.',
        };
      }

      // 2. Validate payload
      const parseResult = leadCreationSchema.safeParse(rawArgs);
      if (!parseResult.success) {
        return {
          success: false,
          error: 'VALIDATION_ERROR',
          message: parseResult.error.errors.map((e) => e.message).join('; '),
          fields: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        };
      }

      // Check if this session draft was already submitted
      const session = await SessionService.getOrCreateSession(sessionId);
      const currentDraft = (session.draftPayload as any) || {};
      if (currentDraft.applicationId) {
        return {
          success: true,
          applicationId: currentDraft.applicationId,
          status: currentDraft.status || 'SUBMITTED',
          fullName: currentDraft.fullName || parseResult.data.fullName,
          pureGoldGrams: currentDraft.pureGoldGrams,
          eligibleLoanRupees: currentDraft.eligibleLoanRupees,
          createdAt: currentDraft.submittedAt || new Date().toISOString(),
          message: `Application submitted successfully! Your application ID is ${currentDraft.applicationId}.`,
        };
      }

      // 3. Submit lead through single authority LeadService
      try {
        const lead = await LeadService.createLead(parseResult.data);
        await SessionService.updateDraft(sessionId, {
          applicationId: lead.applicationId,
          status: lead.status,
          submittedAt: lead.createdAt,
        } as any);

        return {
          success: true,
          applicationId: lead.applicationId,
          status: lead.status,
          fullName: lead.fullName,
          pureGoldGrams: lead.pureGoldGrams,
          eligibleLoanRupees: lead.eligibleLoanRupees,
          createdAt: lead.createdAt,
          message: `Application submitted successfully! Your application ID is ${lead.applicationId}.`,
        };
      } catch (err: any) {
        if (err instanceof DuplicateApplicationError) {
          return {
            success: false,
            error: 'DUPLICATE_APPLICATION',
            existingApplicationId: err.existingApplicationId,
            existingApplicationDate: err.existingApplicationDate,
            message: err.message,
          };
        }
        if (err instanceof NotFoundError) {
          return {
            success: false,
            error: 'PLAN_NOT_FOUND',
            message: err.message,
          };
        }
        return {
          success: false,
          error: 'SUBMISSION_FAILED',
          message: err.message || 'Failed to submit application',
        };
      }
    }

    default:
      return {
        success: false,
        error: 'UNKNOWN_TOOL',
        message: `Tool '${name}' is not supported.`,
      };
  }
}

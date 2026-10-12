import { prisma } from '../config/db.js';
import { NotFoundError, ValidationError } from '../core/errors.js';
import { ALLOWED_KARATS } from '../core/constants.js';
import { QuoteService } from './quote.service.js';

export interface ApplicationDraft {
  fullName?: string;
  mobileNumber?: string;
  grossWeightGrams?: number;
  netWeightGrams?: number;
  karat?: number;
  selectedPlanId?: string;
  pureGoldGrams?: number;
  goldValueRupees?: number;
  eligibleLoanRupees?: number;
  applicationId?: string;
  status?: string;
  submittedAt?: string;
}

export class SessionService {
  /**
   * Retrieves an existing agent session or initializes a new one.
   */
  static async getOrCreateSession(sessionId?: string) {
    if (sessionId) {
      const existing = await prisma.agentSession.findUnique({
        where: { id: sessionId },
      });
      if (existing) {
        return existing;
      }
    }

    return await prisma.agentSession.create({
      data: {
        messages: [],
        draftVersion: 1,
        isConfirmed: false,
      },
    });
  }

  /**
   * Appends messages to the conversation history.
   */
  static async appendMessages(sessionId: string, newMessages: any[]) {
    const session = await prisma.agentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundError(`Agent session '${sessionId}' not found.`);
    }

    const currentHistory = Array.isArray(session.messages)
      ? (session.messages as any[])
      : [];
    const updatedHistory = [...currentHistory, ...newMessages];

    return await prisma.agentSession.update({
      where: { id: sessionId },
      data: { messages: updatedHistory },
    });
  }

  /**
   * Explicitly invalidates the session's confirmation state.
   */
  static async invalidateConfirmation(sessionId: string) {
    const session = await prisma.agentSession.findUnique({
      where: { id: sessionId },
    });
    const currentDraft = (session?.draftPayload as any) || {};
    if (currentDraft.applicationId) {
      // Completed, submitted applications cannot have their confirmation invalidated
      return session;
    }

    return await prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        isConfirmed: false,
        confirmedDraftVersion: null,
        confirmedAt: null,
      },
    });
  }

  /**
   * Updates the authoritative draft details.
   * Validates domain constraints on updated values.
   * If relevant application details change, invalidates confirmation, increments draftVersion, and recalculates quotes.
   */
  static async updateDraft(sessionId: string, newDraftDetails: Partial<ApplicationDraft>) {
    const session = await prisma.agentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundError(`Agent session '${sessionId}' not found.`);
    }

    const currentDraft = (session.draftPayload as ApplicationDraft | null) ?? {};

    // Invariant: An already-submitted application is finalized and immutable
    if (currentDraft.applicationId) {
      const attemptedFields = Object.keys(newDraftDetails).filter(
        (k) =>
          !['applicationId', 'status', 'submittedAt'].includes(k) &&
          newDraftDetails[k as keyof ApplicationDraft] !== undefined
      );

      if (attemptedFields.length > 0) {
        throw new ValidationError(
          `Application ${currentDraft.applicationId} has already been submitted and cannot be modified.`,
          attemptedFields.map((field) => ({
            field,
            message: `Cannot modify field '${field}' on already-submitted application (${currentDraft.applicationId})`,
          }))
        );
      }

      return session;
    }

    // Validate proposed modifications
    const validationErrors: Array<{ field: string; message: string }> = [];

    if (newDraftDetails.fullName !== undefined) {
      const trimmed = newDraftDetails.fullName.trim();
      if (!/^[a-zA-Z ]{2,60}$/.test(trimmed)) {
        validationErrors.push({
          field: 'fullName',
          message: 'Full name must contain letters and spaces only (2-60 characters)',
        });
      }
    }

    if (newDraftDetails.mobileNumber !== undefined) {
      const cleanMobile = newDraftDetails.mobileNumber.replace(/\D/g, '');
      if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
        validationErrors.push({
          field: 'mobileNumber',
          message: 'Mobile number must be a 10-digit Indian number starting with 6, 7, 8, or 9',
        });
      }
    }

    if (newDraftDetails.grossWeightGrams !== undefined) {
      if (
        typeof newDraftDetails.grossWeightGrams !== 'number' ||
        isNaN(newDraftDetails.grossWeightGrams) ||
        newDraftDetails.grossWeightGrams <= 0 ||
        newDraftDetails.grossWeightGrams > 1000
      ) {
        validationErrors.push({
          field: 'grossWeightGrams',
          message: 'Gross weight must be a positive number up to 1000 grams',
        });
      }
    }

    if (newDraftDetails.netWeightGrams !== undefined) {
      if (
        typeof newDraftDetails.netWeightGrams !== 'number' ||
        isNaN(newDraftDetails.netWeightGrams) ||
        newDraftDetails.netWeightGrams <= 0 ||
        newDraftDetails.netWeightGrams > 1000
      ) {
        validationErrors.push({
          field: 'netWeightGrams',
          message: 'Net weight must be a positive number up to 1000 grams',
        });
      }
    }

    if (newDraftDetails.karat !== undefined) {
      if (
        typeof newDraftDetails.karat !== 'number' ||
        !(ALLOWED_KARATS as readonly number[]).includes(newDraftDetails.karat)
      ) {
        validationErrors.push({
          field: 'karat',
          message: `Karat must be one of: ${ALLOWED_KARATS.join(', ')}`,
        });
      }
    }

    const proposedNet =
      newDraftDetails.netWeightGrams !== undefined
        ? newDraftDetails.netWeightGrams
        : currentDraft.netWeightGrams;
    const proposedGross =
      newDraftDetails.grossWeightGrams !== undefined
        ? newDraftDetails.grossWeightGrams
        : currentDraft.grossWeightGrams;

    if (
      proposedNet !== undefined &&
      proposedGross !== undefined &&
      proposedNet > proposedGross
    ) {
      validationErrors.push({
        field: 'netWeightGrams',
        message: 'Net weight cannot exceed gross weight',
      });
    }

    if (validationErrors.length > 0) {
      // Invalidate existing confirmation so invalid inputs never leave application in falsely confirmed state
      if (session.isConfirmed) {
        await prisma.agentSession.update({
          where: { id: sessionId },
          data: {
            isConfirmed: false,
            confirmedDraftVersion: null,
            confirmedAt: null,
          },
        });
      }
      throw new ValidationError(validationErrors[0].message, validationErrors);
    }

    // Check if relevant parameters have changed
    const relevantKeys: (keyof ApplicationDraft)[] = [
      'fullName',
      'mobileNumber',
      'grossWeightGrams',
      'netWeightGrams',
      'karat',
      'selectedPlanId',
    ];

    let hasMaterialChange = false;
    for (const key of relevantKeys) {
      if (
        newDraftDetails[key] !== undefined &&
        newDraftDetails[key] !== currentDraft[key]
      ) {
        hasMaterialChange = true;
        break;
      }
    }

    const mergedDraft: ApplicationDraft = {
      ...currentDraft,
      ...newDraftDetails,
    };

    // Recalculate or refresh financial quote when weights/karat are present
    if (
      mergedDraft.netWeightGrams !== undefined &&
      mergedDraft.grossWeightGrams !== undefined &&
      mergedDraft.karat !== undefined &&
      mergedDraft.netWeightGrams <= mergedDraft.grossWeightGrams
    ) {
      try {
        const planId = mergedDraft.selectedPlanId || 'PLAN_EMI_01';
        const quote = QuoteService.calculateQuote({
          netWeightGrams: mergedDraft.netWeightGrams,
          grossWeightGrams: mergedDraft.grossWeightGrams,
          karat: mergedDraft.karat,
          selectedPlanId: planId,
        });
        mergedDraft.pureGoldGrams = quote.pureGoldGrams;
        mergedDraft.goldValueRupees = quote.goldValueRupees;
        mergedDraft.eligibleLoanRupees = quote.eligibleLoanRupees;
      } catch {
        delete mergedDraft.pureGoldGrams;
        delete mergedDraft.goldValueRupees;
        delete mergedDraft.eligibleLoanRupees;
      }
    } else {
      delete mergedDraft.pureGoldGrams;
      delete mergedDraft.goldValueRupees;
      delete mergedDraft.eligibleLoanRupees;
    }

    // Material change bumps version and invalidates confirmation
    const shouldInvalidateAndBump =
      hasMaterialChange &&
      (session.isConfirmed ||
        (currentDraft.netWeightGrams !== undefined &&
          newDraftDetails.netWeightGrams !== undefined &&
          newDraftDetails.netWeightGrams !== currentDraft.netWeightGrams) ||
        (currentDraft.grossWeightGrams !== undefined &&
          newDraftDetails.grossWeightGrams !== undefined &&
          newDraftDetails.grossWeightGrams !== currentDraft.grossWeightGrams) ||
        (currentDraft.karat !== undefined &&
          newDraftDetails.karat !== undefined &&
          newDraftDetails.karat !== currentDraft.karat) ||
        (currentDraft.selectedPlanId !== undefined &&
          newDraftDetails.selectedPlanId !== undefined &&
          newDraftDetails.selectedPlanId !== currentDraft.selectedPlanId) ||
        (currentDraft.fullName !== undefined &&
          newDraftDetails.fullName !== undefined &&
          newDraftDetails.fullName !== currentDraft.fullName) ||
        (currentDraft.mobileNumber !== undefined &&
          newDraftDetails.mobileNumber !== undefined &&
          newDraftDetails.mobileNumber !== currentDraft.mobileNumber));

    if (shouldInvalidateAndBump) {
      return await prisma.agentSession.update({
        where: { id: sessionId },
        data: {
          draftPayload: mergedDraft as any,
          draftVersion: session.draftVersion + 1,
          isConfirmed: false,
          confirmedDraftVersion: null,
          confirmedAt: null,
        },
      });
    }

    return await prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        draftPayload: mergedDraft as any,
      },
    });
  }

  /**
   * Confirms the authoritative draft for submission.
   */
  static async confirmDraft(sessionId: string, draftVersion: number) {
    const session = await prisma.agentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundError(
        `Agent session '${sessionId}' not found.`,
        [{ field: 'sessionId', message: 'Session not found' }]
      );
    }

    if (!session.draftPayload) {
      throw new ValidationError('No active draft exists in this session to confirm.', [
        { field: 'draftPayload', message: 'Missing application draft' },
      ]);
    }

    if (session.draftVersion !== draftVersion) {
      throw new ValidationError(
        `Draft version mismatch. Expected version ${session.draftVersion}, received ${draftVersion}. Application details were modified.`,
        [{ field: 'draftVersion', message: 'Draft version out of date' }]
      );
    }

    const draft = session.draftPayload as ApplicationDraft;
    if (draft.applicationId) {
      // Completed, submitted draft remains confirmed and immutable
      return {
        confirmed: true,
        sessionId: session.id,
        draftVersion: session.draftVersion,
        confirmedAt: session.confirmedAt?.toISOString(),
        draft: session.draftPayload,
      };
    }
    // Verify draft completeness and domain validity before confirming
    if (
      !draft.fullName ||
      !draft.mobileNumber ||
      draft.grossWeightGrams === undefined ||
      draft.netWeightGrams === undefined ||
      draft.karat === undefined ||
      !draft.selectedPlanId
    ) {
      throw new ValidationError('Application draft is incomplete and cannot be confirmed.', [
        { field: 'draftPayload', message: 'Missing required application details for confirmation' },
      ]);
    }

    if (draft.netWeightGrams > draft.grossWeightGrams) {
      throw new ValidationError('Net weight cannot exceed gross weight.', [
        { field: 'netWeightGrams', message: 'Net weight cannot exceed gross weight' },
      ]);
    }

    const updated = await prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        isConfirmed: true,
        confirmedDraftVersion: draftVersion,
        confirmedAt: new Date(),
      },
    });

    return {
      confirmed: true,
      sessionId: updated.id,
      draftVersion: updated.draftVersion,
      confirmedAt: updated.confirmedAt?.toISOString(),
      draft: updated.draftPayload,
    };
  }

  /**
   * Checks whether the current draft has valid server-recorded confirmation.
   */
  static async isDraftConfirmed(sessionId: string): Promise<boolean> {
    const session = await prisma.agentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) return false;

    return (
      session.isConfirmed === true &&
      session.confirmedDraftVersion !== null &&
      session.confirmedDraftVersion === session.draftVersion &&
      session.draftPayload !== null
    );
  }
}

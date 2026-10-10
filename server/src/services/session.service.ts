import { prisma } from '../config/db.js';
import { NotFoundError, ValidationError } from '../core/errors.js';

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
   * Updates the authoritative draft details.
   * If relevant application details change, invalidates confirmation and increments draftVersion.
   */
  static async updateDraft(sessionId: string, newDraftDetails: Partial<ApplicationDraft>) {
    const session = await prisma.agentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundError(`Agent session '${sessionId}' not found.`);
    }

    const currentDraft = (session.draftPayload as ApplicationDraft | null) ?? {};

    // Check if relevant parameters have changed
    const relevantKeys: (keyof ApplicationDraft)[] = [
      'fullName',
      'mobileNumber',
      'grossWeightGrams',
      'netWeightGrams',
      'karat',
      'selectedPlanId',
    ];

    let hasChanged = false;
    for (const key of relevantKeys) {
      if (
        newDraftDetails[key] !== undefined &&
        newDraftDetails[key] !== currentDraft[key]
      ) {
        hasChanged = true;
        break;
      }
    }

    const mergedDraft: ApplicationDraft = {
      ...currentDraft,
      ...newDraftDetails,
    };

    // Only bump draft version and invalidate if confirmed or if existing quoted weights change
    const isModification =
      session.isConfirmed ||
      (currentDraft.netWeightGrams !== undefined &&
        newDraftDetails.netWeightGrams !== undefined &&
        newDraftDetails.netWeightGrams !== currentDraft.netWeightGrams) ||
      (currentDraft.karat !== undefined &&
        newDraftDetails.karat !== undefined &&
        newDraftDetails.karat !== currentDraft.karat);

    if (isModification && hasChanged) {
      // Meaningful modification after confirmation or initial quote:
      // Invalidate confirmation and bump draft version
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
      session.confirmedDraftVersion === session.draftVersion
    );
  }
}

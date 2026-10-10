import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SessionService } from '../services/session.service.js';
import { getChatAgent } from '../agent/gemini.client.js';
import { executeToolCall } from '../agent/tools.js';

export const chatRequestSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1, 'Message cannot be empty'),
});

export const confirmRequestSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  draftVersion: z.number({ invalid_type_error: 'Draft version must be a number' }).int().positive(),
});

export function extractApplicantDetailsFromText(text: string): Record<string, any> {
  const extracted: Record<string, any> = {};

  // Name match: e.g. "My name is Rajesh Patel", "Name: Rajesh Patel", "Applicant: Rajesh Patel"
  const nameMatch =
    text.match(/(?:my name is|name is|name:|applicant is|applicant full name is|i am)\s+([a-zA-Z]{2,30}(?:\s+[a-zA-Z]{2,30}){0,3})/i);
  if (nameMatch && nameMatch[1]) {
    const rawName = nameMatch[1].trim();
    const disallowed = ['a', 'the', 'interested', 'applying', 'looking', 'here'];
    if (rawName.length >= 2 && rawName.length <= 60 && !disallowed.includes(rawName.toLowerCase())) {
      extracted.fullName = rawName;
    }
  }

  // Mobile match: 10 Indian digits starting with 6-9
  const mobileMatch = text.match(/\b([6-9]\d{9})\b/);
  if (mobileMatch && mobileMatch[1]) {
    extracted.mobileNumber = mobileMatch[1];
  }

  // Scheme match: PLAN_EMI_01 or PLAN_BULLET_01 or "monthly emi" or "bullet"
  const planCodeMatch = text.match(/\b(PLAN_EMI_01|PLAN_BULLET_01)\b/i);
  if (planCodeMatch) {
    extracted.selectedPlanId = planCodeMatch[1].toUpperCase();
  } else if (/monthly emi|emi scheme|emi plan/i.test(text)) {
    extracted.selectedPlanId = 'PLAN_EMI_01';
  } else if (/bullet repayment|bullet scheme|bullet plan/i.test(text)) {
    extracted.selectedPlanId = 'PLAN_BULLET_01';
  }

  return extracted;
}

export async function handleAgentChat(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { sessionId, message } = chatRequestSchema.parse(req.body);

    // 1. Retrieve or create session
    const session = await SessionService.getOrCreateSession(sessionId);

    // Ingest any applicant details directly present in the user message
    const extractedDetails = extractApplicantDetailsFromText(message);
    if (Object.keys(extractedDetails).length > 0) {
      await SessionService.updateDraft(session.id, extractedDetails);
    }

    // 2. Obtain agent instance
    const agent = getChatAgent();

    // 3. Generate response with tool execution loop
    const history = Array.isArray(session.messages) ? (session.messages as any[]) : [];
    const agentResult = await agent.generateResponse(session.id, message, history);

    // 4. Record messages to session history
    const newMessages = [
      { role: 'user', content: message, timestamp: new Date().toISOString() },
      { role: 'model', content: agentResult.reply, timestamp: new Date().toISOString() },
    ];
    await SessionService.appendMessages(session.id, newMessages);

    // 5. Reload latest session state
    const updatedSession = await SessionService.getOrCreateSession(session.id);

    res.status(200).json({
      sessionId: updatedSession.id,
      reply: agentResult.reply,
      draft: updatedSession.draftPayload,
      draftVersion: updatedSession.draftVersion,
      isConfirmed: updatedSession.isConfirmed,
      toolCallsExecuted: agentResult.toolCallsExecuted,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleAgentConfirm(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { sessionId, draftVersion } = confirmRequestSchema.parse(req.body);

    // 1. Backend verifies confirmed draft version matches current pending application
    const confirmResult = await SessionService.confirmDraft(sessionId, draftVersion);

    // 2. Deterministic guarded submission execution:
    // If the confirmed draft contains complete applicant details, execute guarded submission handler directly.
    const draft = confirmResult.draft as any;
    let submissionResult: any = null;

    if (
      draft?.fullName &&
      draft?.mobileNumber &&
      draft?.grossWeightGrams &&
      draft?.netWeightGrams &&
      draft?.karat &&
      draft?.selectedPlanId
    ) {
      submissionResult = await executeToolCall(
        'submit_application',
        {
          fullName: draft.fullName,
          mobileNumber: draft.mobileNumber,
          grossWeightGrams: draft.grossWeightGrams,
          netWeightGrams: draft.netWeightGrams,
          karat: draft.karat,
          selectedPlanId: draft.selectedPlanId,
        },
        sessionId
      );

      // Record system/assistant confirmation notice in message history
      if (submissionResult?.success) {
        await SessionService.appendMessages(sessionId, [
          {
            role: 'model',
            content: `Your gold loan application has been confirmed and submitted successfully! Application ID: ${submissionResult.applicationId}.`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    }

    res.status(200).json({
      ...confirmResult,
      submission: submissionResult,
    });
  } catch (err) {
    next(err);
  }
}

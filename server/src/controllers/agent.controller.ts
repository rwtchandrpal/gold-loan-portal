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

export interface ExtractedDetailsResult {
  details: Record<string, any>;
  isCorrection: boolean;
  invalidReason?: string;
}

export function extractApplicantDetailsFromText(
  text: string,
  currentDraft?: Record<string, any>
): ExtractedDetailsResult {
  const details: Record<string, any> = {};
  let isCorrection = false;
  let invalidReason: string | undefined;

  // Name match: e.g. "My name is Rajesh Patel", "Name: Rajesh Patel", "Name Rajesh Patel", "Applicant: Rajesh Patel"
  const nameMatch =
    text.match(/(?:my name is|name is|name:|name|applicant is|applicant full name is|applicant:|applicant|i am|change name to|update name to)\s+([a-zA-Z]{2,30}(?:\s+[a-zA-Z]{2,30}){0,3})/i);
  if (nameMatch && nameMatch[1]) {
    const rawName = nameMatch[1].trim();
    const disallowed = ['a', 'the', 'interested', 'applying', 'looking', 'here', 'ready'];
    if (rawName.length >= 2 && rawName.length <= 60 && !disallowed.includes(rawName.toLowerCase())) {
      details.fullName = rawName;
      if (text.match(/change|update|actually|correct/i)) isCorrection = true;
    }
  }

  // Mobile match: 10 Indian digits starting with 6-9
  const mobileMatch = text.match(/\b([6-9]\d{9})\b/);
  if (mobileMatch && mobileMatch[1]) {
    details.mobileNumber = mobileMatch[1];
    if (text.match(/change|update|actually|correct/i)) isCorrection = true;
  } else if (text.match(/mobile\s*(?:is|to|:)\s*(\d+)/i)) {
    const rawMobile = text.match(/mobile\s*(?:is|to|:)\s*(\d+)/i)![1];
    if (rawMobile.length !== 10 || !/^[6-9]/.test(rawMobile)) {
      invalidReason = 'Mobile number must be a 10-digit Indian number starting with 6, 7, 8, or 9';
    }
  }

  // Scheme match: PLAN_EMI_01 or PLAN_BULLET_01 or "monthly emi" or "bullet"
  // Do not treat pure inquiries ("show me the EMI option", "tell me about", "which scheme has a lower interest rate") as confirmed selections
  const isSchemeInquiry = /(?:which scheme|which plan|what scheme|what plan|show me|tell me|explain|info on|details of|compare|lower interest|lowest interest|the other|other scheme|other plan|switch)/i.test(text);

  if (!isSchemeInquiry) {
    const planCodeMatch = text.match(/\b(PLAN_EMI_01|PLAN_BULLET_01)\b/i);
    if (planCodeMatch) {
      details.selectedPlanId = planCodeMatch[1].toUpperCase();
      if (text.match(/change|update|switch|actually/i)) isCorrection = true;
    } else if (/monthly emi|emi scheme|emi plan/i.test(text) || /(?:want|choose|select|opt for)\s*(?:the\s*)?emi/i.test(text)) {
      details.selectedPlanId = 'PLAN_EMI_01';
      if (text.match(/change|update|switch|actually/i)) isCorrection = true;
    } else if (/bullet repayment|bullet scheme|bullet plan/i.test(text) || /(?:want|choose|select|opt for)\s*(?:the\s*)?bullet/i.test(text)) {
      details.selectedPlanId = 'PLAN_BULLET_01';
      if (text.match(/change|update|switch|actually/i)) isCorrection = true;
    }
  }

  return { details, isCorrection, invalidReason };
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
    const currentDraft = (session.draftPayload as any) || {};

    // Invariant: Once an application is submitted, it is finalized and immutable
    if (currentDraft.applicationId) {
      if (
        message.match(/actually|change|update|correct|net|gross|karat|plan|scheme|name|mobile/i)
      ) {
        const reply = `Your application (${currentDraft.applicationId}) has already been submitted and cannot be modified. If you need any assistance, please contact our support team.`;
        await SessionService.appendMessages(session.id, [
          { role: 'user', content: message, timestamp: new Date().toISOString() },
          { role: 'model', content: reply, timestamp: new Date().toISOString() },
        ]);
        res.status(200).json({
          sessionId: session.id,
          reply,
          draft: session.draftPayload,
          draftVersion: session.draftVersion,
          isConfirmed: session.isConfirmed,
          toolCallsExecuted: [],
        });
        return;
      }
    }

    // Ingest any applicant details or corrections directly present in user message
    const extraction = extractApplicantDetailsFromText(message, currentDraft);

    if (extraction.invalidReason) {
      // Invalidate confirmation if session was confirmed, but DO NOT corrupt stored draft details
      if (session.isConfirmed) {
        await SessionService.invalidateConfirmation(session.id);
      }
      const updatedSession = await SessionService.getOrCreateSession(session.id);
      const reply = `Validation error: ${extraction.invalidReason}. Please provide a valid value to continue.`;
      await SessionService.appendMessages(session.id, [
        { role: 'user', content: message, timestamp: new Date().toISOString() },
        { role: 'model', content: reply, timestamp: new Date().toISOString() },
      ]);
      res.status(200).json({
        sessionId: updatedSession.id,
        reply,
        draft: updatedSession.draftPayload,
        draftVersion: updatedSession.draftVersion,
        isConfirmed: updatedSession.isConfirmed,
        toolCallsExecuted: [],
      });
      return;
    }

    if (Object.keys(extraction.details).length > 0) {
      try {
        await SessionService.updateDraft(session.id, extraction.details);
      } catch (err: any) {
        if (session.isConfirmed) {
          await SessionService.invalidateConfirmation(session.id);
        }
        const updatedSession = await SessionService.getOrCreateSession(session.id);
        const reply = `Validation error: ${err.message}. Please check your details and try again.`;
        await SessionService.appendMessages(session.id, [
          { role: 'user', content: message, timestamp: new Date().toISOString() },
          { role: 'model', content: reply, timestamp: new Date().toISOString() },
        ]);
        res.status(200).json({
          sessionId: updatedSession.id,
          reply,
          draft: updatedSession.draftPayload,
          draftVersion: updatedSession.draftVersion,
          isConfirmed: updatedSession.isConfirmed,
          toolCallsExecuted: [],
        });
        return;
      }
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

import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { AGENT_SYSTEM_PROMPT } from './system-prompt.js';
import { GEMINI_TOOLS_DECLARATIONS, executeToolCall } from './tools.js';
import { SessionService } from '../services/session.service.js';
import { maskMobileNumber } from '../utils/serialization.js';

export interface ChatAgentResult {
  reply: string;
  toolCallsExecuted: Array<{
    name: string;
    args: any;
    result: any;
  }>;
}

export interface IChatAgent {
  generateResponse(
    sessionId: string,
    userMessage: string,
    history: any[]
  ): Promise<ChatAgentResult>;
}

/**
 * Live Google Gemini AI Agent implementation using official @google/genai SDK.
 */
export class LiveGeminiAgent implements IChatAgent {
  private ai: GoogleGenAI;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    const key = apiKey || env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is required to initialize LiveGeminiAgent.');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.model = model || env.GEMINI_MODEL;
  }

  async generateResponse(
    sessionId: string,
    userMessage: string,
    history: any[]
  ): Promise<ChatAgentResult> {
    const toolCallsExecuted: Array<{ name: string; args: any; result: any }> = [];

    // Format conversation history for Gemini SDK
    const contents: any[] = history.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    // Append current user message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });

    try {
      const maxIterations = 5;
      let iterations = 0;
      let finalReply = '';

      while (iterations < maxIterations) {
        iterations++;

        const response = await this.ai.models.generateContent({
          model: this.model,
          contents,
          config: {
            systemInstruction: AGENT_SYSTEM_PROMPT,
            tools: [{ functionDeclarations: GEMINI_TOOLS_DECLARATIONS as any }],
          },
        });

        const functionCalls = response.functionCalls;

        if (!functionCalls || functionCalls.length === 0) {
          finalReply = response.text || 'I am ready to help with your gold loan application.';
          break;
        }

        // Model requested function call(s)
        if (response.candidates?.[0]?.content) {
          contents.push(response.candidates[0].content);
        }

        for (const call of functionCalls) {
          const toolName = call.name || 'unknown_tool';
          const safeArgs = (call.args || {}) as Record<string, any>;
          if (safeArgs.mobileNumber) {
            console.log(`[Tool Call] ${toolName} with mobile: ${maskMobileNumber(String(safeArgs.mobileNumber))}`);
          } else {
            console.log(`[Tool Call] ${toolName}:`, safeArgs);
          }

          const toolResult = await executeToolCall(toolName, call.args, sessionId);
          toolCallsExecuted.push({
            name: toolName,
            args: call.args,
            result: toolResult,
          });

          if (!response.candidates?.[0]?.content) {
            contents.push({
              role: 'model',
              parts: [{ functionCall: call }],
            });
          }

          contents.push({
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: call.name,
                  response: toolResult,
                },
              },
            ],
          });
        }
      }

      return {
        reply: finalReply,
        toolCallsExecuted,
      };
    } catch (liveErr) {
      console.warn('[Live Gemini Fallback to Mock]:', (liveErr as Error).message);
      const mock = new MockGeminiAgent();
      return await mock.generateResponse(sessionId, userMessage, history);
    }
  }
}

/**
 * Deterministic Mock AI Agent for offline tests and evaluation suites.
 */
export class MockGeminiAgent implements IChatAgent {
  async generateResponse(
    sessionId: string,
    userMessage: string,
    _history: any[]
  ): Promise<ChatAgentResult> {
    const toolCallsExecuted: Array<{ name: string; args: any; result: any }> = [];
    const text = userMessage.toLowerCase().trim();

    // 1. Off-topic detection
    const offTopicKeywords = [
      'crypto',
      'bitcoin',
      'ethereum',
      'stock',
      'stocks',
      'mutual fund',
      'weather',
      'home loan',
      'car loan',
      'personal loan',
      'python',
      'recipe',
    ];
    if (offTopicKeywords.some((keyword) => text.includes(keyword))) {
      return {
        reply:
          'I specialize exclusively in gold loans on the Gold Loan Portal. I cannot assist with investments, cryptocurrencies, stocks, or other unrelated inquiries. Would you like to check your gold loan eligibility or explore our gold loan plans instead?',
        toolCallsExecuted,
      };
    }

    const session = await SessionService.getOrCreateSession(sessionId);
    const draft = (session.draftPayload as any) || {};

    // 2. Immutability of already submitted application
    if (draft.applicationId) {
      if (text.includes('submit') || text.includes('apply')) {
        const submitResult = await executeToolCall('submit_application', {}, sessionId);
        toolCallsExecuted.push({
          name: 'submit_application',
          args: {},
          result: submitResult,
        });
        return {
          reply: `Congratulations! Your gold loan application has been submitted successfully with Application ID ${draft.applicationId}. Our executive will contact you shortly.`,
          toolCallsExecuted,
        };
      }

      if (
        text.match(/actually|change|update|correct|weight|net|gross|karat|plan|scheme|name|mobile/i)
      ) {
        return {
          reply: `Your application (${draft.applicationId}) has already been submitted and cannot be modified. If you need to make changes, please contact our support team.`,
          toolCallsExecuted: [],
        };
      }

      return {
        reply: `Your application (${draft.applicationId}) has already been submitted. Our executive will contact you shortly. If you have any questions, our support team is happy to assist you.`,
        toolCallsExecuted: [],
      };
    }

    // 3. Ambiguous corrections ("I entered the wrong weight", "wrong weight", etc. without specifying numbers)
    const isAmbiguousWeightCorrection =
      Boolean(
        text.match(
          /(?:entered|made a mistake|wrong|mistake|correct).*(?:weight|weights)|(?:weight|weights).*(?:wrong|mistake|incorrect)/i
        )
      ) && !/\d/.test(text);

    if (isAmbiguousWeightCorrection) {
      return {
        reply:
          'Could you please specify whether you would like to update your gross weight or net weight, and provide the correct value in grams?',
        toolCallsExecuted,
      };
    }

    // 4. Scheme inquiry, comparison, and selection
    const isSchemeComparison =
      Boolean(
        text.match(/(?:lower|lowest|cheaper|better|compare)\s*(?:interest|rate|scheme|plan)/i)
      ) || text.includes('which scheme has a lower interest');
    const isEmiInquiry = Boolean(
      text.match(/(?:show me|tell me about|what is|info on).*(?:emi|monthly emi)/i)
    );
    const isBulletInquiry = Boolean(
      text.match(/(?:show me|tell me about|what is|info on).*(?:bullet|bullet repayment)/i)
    );
    const isGeneralSchemeInquiry =
      Boolean(
        text.match(
          /(?:what|which|show|list|tell|available)\s*(?:loan\s*)?(?:schemes|plans|options)/i
        ) ||
          text.match(/(?:what schemes|what plans|what options do you have|offer|schemes available)/i)
      ) && !text.includes('submit');
    const isOtherScheme =
      Boolean(text.match(/(?:the other|other)\s*(?:scheme|plan)/i)) ||
      Boolean(text.match(/switch\s*(?:the\s*)?(?:scheme|plan)/i)) ||
      Boolean(text.match(/change.*to the other scheme/i));
    const isSchemeSelection =
      isOtherScheme ||
      Boolean(
        text.match(
          /(?:i want|prefer|choose|select|opt for|pick|go with|switch to|change.*to)\s*(?:the\s*)?(?:bullet|emi|plan_bullet_01|plan_emi_01)/i
        )
      );

    const hasWeightNumbers = Boolean(text.match(/\d+(?:\.\d+)?\s*g(?:ram)?s?/i));

    if (
      (isSchemeComparison ||
        isEmiInquiry ||
        isBulletInquiry ||
        isGeneralSchemeInquiry ||
        isSchemeSelection) &&
      !hasWeightNumbers
    ) {
      const schemesResult = await executeToolCall('get_loan_schemes', {}, sessionId);
      toolCallsExecuted.push({
        name: 'get_loan_schemes',
        args: {},
        result: schemesResult,
      });

      if (isSchemeComparison) {
        return {
          reply:
            'Monthly EMI (PLAN_EMI_01) has the lower interest rate at 10.5% per annum (compared to 12.0% per annum for Bullet Repayment). Would you like to select Monthly EMI or Bullet Repayment for your application?',
          toolCallsExecuted,
        };
      }

      if (isEmiInquiry) {
        return {
          reply:
            'Our Monthly EMI scheme (PLAN_EMI_01) offers an interest rate of 10.5% per annum with up to 75% LTV over a 12-month tenure (equal monthly instalments). Would you like to select this scheme for your loan?',
          toolCallsExecuted,
        };
      }

      if (isBulletInquiry) {
        return {
          reply:
            'Our Bullet Repayment scheme (PLAN_BULLET_01) offers an interest rate of 12.0% per annum with up to 70% LTV over a 12-month tenure (interest and principal repaid at maturity). Would you like to select this scheme for your loan?',
          toolCallsExecuted,
        };
      }

      if (isGeneralSchemeInquiry && !isSchemeSelection) {
        return {
          reply:
            'We offer two primary gold loan plans:\n1. Bullet Repayment (PLAN_BULLET_01): 12.0% annual interest, up to 70% LTV, 12-month tenure.\n2. Monthly EMI (PLAN_EMI_01): 10.5% annual interest, up to 75% LTV, 12-month tenure.\nPlease provide your gold weights (gross and net) and karat purity to calculate your eligible loan amount.',
          toolCallsExecuted,
        };
      }

      if (isSchemeSelection) {
        let targetPlanId: string | undefined;
        if (isOtherScheme) {
          if (draft.selectedPlanId === 'PLAN_EMI_01') targetPlanId = 'PLAN_BULLET_01';
          else if (draft.selectedPlanId === 'PLAN_BULLET_01') targetPlanId = 'PLAN_EMI_01';
          else {
            return {
              reply:
                'We offer Monthly EMI (PLAN_EMI_01) and Bullet Repayment (PLAN_BULLET_01). Which scheme would you like to select?',
              toolCallsExecuted,
            };
          }
        } else if (text.includes('bullet')) {
          targetPlanId = 'PLAN_BULLET_01';
        } else if (text.includes('emi')) {
          targetPlanId = 'PLAN_EMI_01';
        }

        if (targetPlanId && targetPlanId !== draft.selectedPlanId) {
          await SessionService.updateDraft(sessionId, { selectedPlanId: targetPlanId });
        }

        const freshSession = await SessionService.getOrCreateSession(sessionId);
        const freshDraft = (freshSession.draftPayload as any) || {};
        const targetSchemeName =
          targetPlanId === 'PLAN_BULLET_01' ? 'Bullet Repayment' : 'Monthly EMI';

        if (freshDraft.netWeightGrams && freshDraft.grossWeightGrams && freshDraft.karat) {
          return {
            reply: `I have updated your selected loan scheme to ${targetSchemeName} (${targetPlanId}). Based on your ${freshDraft.netWeightGrams}g of ${freshDraft.karat}K gold, your maximum eligible loan is ₹${freshDraft.eligibleLoanRupees?.toLocaleString('en-IN')}. Please review the updated Confirmation Card on your screen and click "Confirm & Submit" to finalize your application.`,
            toolCallsExecuted,
          };
        } else {
          return {
            reply: `I have selected ${targetSchemeName} (${targetPlanId}) for your application. Please provide your gold weights (gross and net) and karat purity to calculate your eligible loan amount.`,
            toolCallsExecuted,
          };
        }
      }
    }

    // 5. Parse weights, karats, and applicant fields
    // A. Gross weight (supports contrast: "gross should be 48 grams, not 50")
    const grossContrastMatch = text.match(
      /gross.*?(\d+(?:\.\d+)?)\s*(?:g|gram|grams)?(?:\s*,?\s*(?:not|instead of)\s*(\d+(?:\.\d+)?))/i
    );
    const grossGeneralMatch =
      text.match(/gross\s*(?:weight\s*)?(?:should be|is|of|to|[:=])?\s*(\d+(?:\.\d+)?)/i) ||
      text.match(/(\d+(?:\.\d+)?)\s*g(?:ram)?s?\s*(?:of\s*)?gross/i);

    const extractedGross = grossContrastMatch
      ? parseFloat(grossContrastMatch[1])
      : grossGeneralMatch
      ? parseFloat(grossGeneralMatch[1])
      : undefined;

    // B. Net weight (supports contrast: "net should be 42 grams, not 45")
    const netContrastMatch = text.match(
      /net.*?(\d+(?:\.\d+)?)\s*(?:g|gram|grams)?(?:\s*,?\s*(?:not|instead of)\s*(\d+(?:\.\d+)?))/i
    );
    const netGeneralMatch =
      text.match(/net\s*(?:weight\s*)?(?:should be|is|of|to|[:=])?\s*(\d+(?:\.\d+)?)/i) ||
      text.match(/(\d+(?:\.\d+)?)\s*g(?:ram)?s?\s*(?:of\s*)?net/i);

    const extractedNet = netContrastMatch
      ? parseFloat(netContrastMatch[1])
      : netGeneralMatch
      ? parseFloat(netGeneralMatch[1])
      : undefined;

    // C. Karat purity
    const karatMatch =
      text.match(/(\d{1,2})\s*k(?:arat)?\b/i) ||
      text.match(/karat\s*(?:should be|is|of|to|[:=])?\s*(\d{1,2})\b/i) ||
      text.match(/purity\s*(?:should be|is|of|to|[:=])?\s*(\d{1,2})\s*k?\b/i);

    const extractedKarat = karatMatch ? parseInt(karatMatch[1], 10) : undefined;

    // D. Unlabelled weight (if neither gross nor net was labeled)
    const unlabelledMatch =
      extractedGross === undefined && extractedNet === undefined
        ? text.match(/(\d+(?:\.\d+)?)\s*g(?:ram)?s?\b/i)
        : null;
    const unlabelledWeight = unlabelledMatch ? parseFloat(unlabelledMatch[1]) : undefined;

    // E. Name and mobile
    const nameMatch =
      userMessage.match(/name\s*(?:is|:)\s*([a-zA-Z ]{2,60})/i) ||
      userMessage.match(/my name is ([a-zA-Z ]{2,60})/i) ||
      userMessage.match(/I am ([a-zA-Z ]{2,60})/i);
    const mobileMatch = userMessage.match(/\b([6-9]\d{9})\b/);
    const planMatch =
      userMessage.match(/\b(PLAN_EMI_01|PLAN_BULLET_01)\b/i) ||
      (text.includes('bullet') ? 'PLAN_BULLET_01' : text.includes('emi') ? 'PLAN_EMI_01' : null);

    // 6. Validate Karat
    if (extractedKarat !== undefined && ![18, 22, 24].includes(extractedKarat)) {
      if (session.isConfirmed) {
        await SessionService.invalidateConfirmation(sessionId);
      }
      return {
        reply:
          'Validation Error: Karat must be one of: 18, 22, or 24. Please provide a valid gold purity (18K, 22K, or 24K).',
        toolCallsExecuted,
      };
    }

    // 7. Unlabelled weight ambiguity
    if (unlabelledWeight !== undefined && !text.includes('gross') && !text.includes('net')) {
      if (extractedKarat !== undefined) {
        await SessionService.updateDraft(sessionId, { karat: extractedKarat });
      }
      return {
        reply: `Is ${unlabelledWeight}g your gross weight or net gold weight? Please specify both gross weight and net gold weight (excluding stones or gems).`,
        toolCallsExecuted,
      };
    }

    // 8. Weights domain validation
    if (extractedGross !== undefined && (extractedGross <= 0 || extractedGross > 1000)) {
      if (session.isConfirmed) {
        await SessionService.invalidateConfirmation(sessionId);
      }
      return {
        reply:
          'Validation Error: Gross weight must be a positive number up to 1000 grams. Please check your weights and try again.',
        toolCallsExecuted,
      };
    }

    if (extractedNet !== undefined && (extractedNet <= 0 || extractedNet > 1000)) {
      if (session.isConfirmed) {
        await SessionService.invalidateConfirmation(sessionId);
      }
      return {
        reply:
          'Validation Error: Net weight must be a positive number up to 1000 grams. Please check your weights and try again.',
        toolCallsExecuted,
      };
    }

    const hasWeightOrKaratInMessage =
      extractedGross !== undefined ||
      extractedNet !== undefined ||
      extractedKarat !== undefined;

    // 9. Pure Submission request (without new weights)
    const isPureSubmissionRequest =
      (text.includes('submit') || text.includes('apply')) && !hasWeightOrKaratInMessage;

    if (isPureSubmissionRequest) {
      const missingForSubmit: string[] = [];
      if (!draft.fullName) missingForSubmit.push('Full Name');
      if (!draft.mobileNumber) missingForSubmit.push('Mobile Number');
      if (!draft.grossWeightGrams) missingForSubmit.push('Gross Weight');
      if (!draft.netWeightGrams) missingForSubmit.push('Net Weight');
      if (!draft.karat) missingForSubmit.push('Karat');
      if (!draft.selectedPlanId) missingForSubmit.push('Loan Scheme');

      if (missingForSubmit.length > 0) {
        return {
          reply: `Application submission cannot proceed because your application details are incomplete. Please provide: ${missingForSubmit.join(', ')}.`,
          toolCallsExecuted,
        };
      }

      const payload = {
        fullName: draft.fullName,
        mobileNumber: draft.mobileNumber,
        grossWeightGrams: draft.grossWeightGrams,
        netWeightGrams: draft.netWeightGrams,
        karat: draft.karat,
        selectedPlanId: draft.selectedPlanId,
      };

      const submitResult = await executeToolCall('submit_application', payload, sessionId);
      toolCallsExecuted.push({
        name: 'submit_application',
        args: payload,
        result: submitResult,
      });

      if (!submitResult.success) {
        if (submitResult.error === 'CONFIRMATION_REQUIRED') {
          return {
            reply:
              'Application submission cannot proceed without your confirmation. Please review the details on the Confirmation Card and click "Confirm & Submit" on your screen.',
            toolCallsExecuted,
          };
        }
        if (submitResult.error === 'DUPLICATE_APPLICATION') {
          return {
            reply: `You already applied within the last 7 days. Your existing application ID is ${submitResult.existingApplicationId}. We cannot submit a new application at this time.`,
            toolCallsExecuted,
          };
        }
        return {
          reply: `Submission failed: ${submitResult.message}`,
          toolCallsExecuted,
        };
      }

      return {
        reply: `Congratulations! Your gold loan application has been submitted successfully with Application ID ${submitResult.applicationId}. Our executive will contact you shortly.`,
        toolCallsExecuted,
      };
    }

    const netToUse = extractedNet !== undefined ? extractedNet : draft.netWeightGrams;
    const grossToUse = extractedGross !== undefined ? extractedGross : draft.grossWeightGrams;
    const karatToUse = extractedKarat !== undefined ? extractedKarat : draft.karat;

    // 10. Quote Calculation when weights/karat are in message and all 3 are present
    if (
      hasWeightOrKaratInMessage &&
      netToUse !== undefined &&
      grossToUse !== undefined &&
      karatToUse !== undefined
    ) {
      if (netToUse > grossToUse) {
        const quoteResult = await executeToolCall(
          'calculate_quote',
          { net: netToUse, gross: grossToUse, karat: karatToUse },
          sessionId
        );
        toolCallsExecuted.push({
          name: 'calculate_quote',
          args: { net: netToUse, gross: grossToUse, karat: karatToUse },
          result: quoteResult,
        });
        return {
          reply: `Validation Error: ${quoteResult.message}. Please check your weights and try again.`,
          toolCallsExecuted,
        };
      }

      const quoteResult = await executeToolCall(
        'calculate_quote',
        { net: netToUse, gross: grossToUse, karat: karatToUse },
        sessionId
      );
      toolCallsExecuted.push({
        name: 'calculate_quote',
        args: { net: netToUse, gross: grossToUse, karat: karatToUse },
        result: quoteResult,
      });

      if (!quoteResult.success) {
        return {
          reply: `Validation Error: ${quoteResult.message}. Please check your weights and try again.`,
          toolCallsExecuted,
        };
      }

      // Update applicant metadata
      const metaUpdate: Record<string, any> = {};
      if (nameMatch) metaUpdate.fullName = nameMatch[2]?.trim() || nameMatch[1]?.trim();
      if (mobileMatch) metaUpdate.mobileNumber = mobileMatch[1];
      if (planMatch)
        metaUpdate.selectedPlanId = typeof planMatch === 'string' ? planMatch : planMatch[1];
      if (Object.keys(metaUpdate).length > 0) {
        await SessionService.updateDraft(sessionId, metaUpdate);
      }

      const freshSession = await SessionService.getOrCreateSession(sessionId);
      const freshDraft = (freshSession.draftPayload as any) || {};

      const missing: string[] = [];
      if (!freshDraft.fullName) missing.push('your Full Name');
      if (!freshDraft.mobileNumber) missing.push('a 10-digit Indian Mobile Number');
      if (!freshDraft.selectedPlanId)
        missing.push('your preferred Loan Scheme (PLAN_EMI_01 or PLAN_BULLET_01)');

      if (missing.length > 0) {
        return {
          reply: `Based on ${netToUse}g of ${karatToUse}K gold, your pure gold weight is ${quoteResult.pureGoldGrams}g, with a gold valuation of ₹${quoteResult.goldValueRupees.toLocaleString('en-IN')}. Under Monthly EMI, your maximum eligible loan is ₹${quoteResult.quotesByPlan.PLAN_EMI_01.eligibleLoanRupees.toLocaleString('en-IN')}.\nTo proceed with your application, please provide ${missing.join(', ')}.`,
          toolCallsExecuted,
        };
      }

      const isCorrection = Boolean(text.match(/actually|change|update|correct|should be/i));
      if (isCorrection) {
        const fieldName =
          extractedGross !== undefined && extractedNet === undefined
            ? `gross weight ${grossToUse}g`
            : `net weight ${netToUse}g`;
        return {
          reply: `I have updated your application with ${fieldName}. Your pure gold weight is ${quoteResult.pureGoldGrams}g, gold valuation is ₹${quoteResult.goldValueRupees?.toLocaleString('en-IN')}, and maximum eligible loan is ₹${freshDraft.eligibleLoanRupees?.toLocaleString('en-IN')} (${freshDraft.selectedPlanId}). Please review the updated Confirmation Card on your screen and click "Confirm & Submit" to finalize your application.`,
          toolCallsExecuted,
        };
      }

      return {
        reply: `Your application draft has been prepared for ₹${freshDraft.eligibleLoanRupees?.toLocaleString('en-IN')} (${freshDraft.selectedPlanId}). Please review the Confirmation Card on your screen and click "Confirm & Submit" to finalize your application.`,
        toolCallsExecuted,
      };
    }

    // 11. Multi-turn Partial Weight Accumulation
    if (hasWeightOrKaratInMessage) {
      const partialUpdate: Record<string, any> = {};
      if (extractedGross !== undefined) partialUpdate.grossWeightGrams = extractedGross;
      if (extractedNet !== undefined) partialUpdate.netWeightGrams = extractedNet;
      if (extractedKarat !== undefined) partialUpdate.karat = extractedKarat;
      if (nameMatch) partialUpdate.fullName = nameMatch[2]?.trim() || nameMatch[1]?.trim();
      if (mobileMatch) partialUpdate.mobileNumber = mobileMatch[1];
      if (planMatch)
        partialUpdate.selectedPlanId = typeof planMatch === 'string' ? planMatch : planMatch[1];

      if (Object.keys(partialUpdate).length > 0) {
        await SessionService.updateDraft(sessionId, partialUpdate);
      }

      const freshSession = await SessionService.getOrCreateSession(sessionId);
      const freshDraft = (freshSession.draftPayload as any) || {};

      if (freshDraft.grossWeightGrams && !freshDraft.netWeightGrams && !freshDraft.karat) {
        return {
          reply:
            'Thank you for providing the gross weight. What is the net gold weight (excluding stones or gems) and karat purity (18K, 22K, or 24K)?',
          toolCallsExecuted,
        };
      }

      if (freshDraft.grossWeightGrams && freshDraft.netWeightGrams && !freshDraft.karat) {
        return {
          reply: `Thank you. I have recorded your gross weight as ${freshDraft.grossWeightGrams}g and net weight as ${freshDraft.netWeightGrams}g. What is the karat purity of your gold (18K, 22K, or 24K)?`,
          toolCallsExecuted,
        };
      }

      if (!freshDraft.grossWeightGrams && freshDraft.netWeightGrams) {
        return {
          reply: `Thank you for providing the net weight (${freshDraft.netWeightGrams}g). What is the total gross weight of your ornaments?`,
          toolCallsExecuted,
        };
      }

      if (freshDraft.karat && !freshDraft.grossWeightGrams && !freshDraft.netWeightGrams) {
        return {
          reply: `Thank you for providing the gold purity (${freshDraft.karat}K). What are your ornament gross and net weights in grams?`,
          toolCallsExecuted,
        };
      }
    }

    // 12. Metadata only turns (Name or Mobile provided without weights)
    if (nameMatch || mobileMatch) {
      const metaUpdate: Record<string, any> = {};
      if (nameMatch) metaUpdate.fullName = nameMatch[2]?.trim() || nameMatch[1]?.trim();
      if (mobileMatch) metaUpdate.mobileNumber = mobileMatch[1];
      if (planMatch)
        metaUpdate.selectedPlanId = typeof planMatch === 'string' ? planMatch : planMatch[1];

      await SessionService.updateDraft(sessionId, metaUpdate);

      const freshSession = await SessionService.getOrCreateSession(sessionId);
      const freshDraft = (freshSession.draftPayload as any) || {};

      if (!freshDraft.grossWeightGrams || !freshDraft.netWeightGrams || !freshDraft.karat) {
        return {
          reply: `Hello ${freshDraft.fullName || ''}! Please share your gold weights (gross and net weight in grams) and karat purity (18K, 22K, or 24K) to calculate your loan eligibility.`.trim(),
          toolCallsExecuted,
        };
      }

      const missing: string[] = [];
      if (!freshDraft.fullName) missing.push('your Full Name');
      if (!freshDraft.mobileNumber) missing.push('a 10-digit Indian Mobile Number');
      if (!freshDraft.selectedPlanId)
        missing.push('your preferred Loan Scheme (PLAN_EMI_01 or PLAN_BULLET_01)');

      if (missing.length > 0) {
        return {
          reply: `Thank you. To proceed with your application, please provide ${missing.join(', ')}.`,
          toolCallsExecuted,
        };
      }

      return {
        reply: `Your application draft has been prepared for ₹${freshDraft.eligibleLoanRupees?.toLocaleString('en-IN')} (${freshDraft.selectedPlanId}). Please review the Confirmation Card on your screen and click "Confirm & Submit" to finalize your application.`,
        toolCallsExecuted,
      };
    }

    // 12. Default conversational response
    return {
      reply:
        'Hello! I am your AI Gold Loan Assistant. How can I help you today? You can ask about our loan plans or share your gold weights and karat to calculate your loan eligibility.',
      toolCallsExecuted,
    };
  }
}

/**
 * Returns an agent instance based on environment or explicit parameter.
 */
export function getChatAgent(options?: { forceMock?: boolean }): IChatAgent {
  if (options?.forceMock === false) {
    return new LiveGeminiAgent();
  }
  if (
    options?.forceMock === true ||
    process.env.MOCK_GEMINI === 'true' ||
    process.env.VITEST === 'true' ||
    process.env.NODE_ENV === 'test' ||
    !env.GEMINI_API_KEY
  ) {
    return new MockGeminiAgent();
  }

  return new LiveGeminiAgent();
}

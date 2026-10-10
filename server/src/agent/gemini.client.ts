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

        // Append assistant tool call and tool result to contents
        contents.push({
          role: 'model',
          parts: [{ functionCall: call }],
        });

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
    const text = userMessage.toLowerCase();

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

    // 2. Weight / Quote Extraction
    // Look for weights or explicit numbers
    const netMatch =
      text.match(/net\s*(?:weight\s*)?(?:of\s*|is\s*|[:=]\s*)?(\d+(?:\.\d+)?)/i) ||
      text.match(/(\d+(?:\.\d+)?)\s*g(?:ram)?s?\s*(?:of\s*)?net/i);
    const grossMatch =
      text.match(/gross\s*(?:weight\s*)?(?:of\s*|is\s*|[:=]\s*)?(\d+(?:\.\d+)?)/i) ||
      text.match(/(\d+(?:\.\d+)?)\s*g(?:ram)?s?\s*(?:of\s*)?gross/i);
    const karatMatch =
      text.match(/(\d{2})\s*k(?:arat)?/i) ||
      text.match(/karat\s*(?:of\s*|is\s*|[:=]\s*)?(\d{2})/i);

    // Look for name and mobile
    const nameMatch = userMessage.match(/name\s*(is|:)\s*([a-zA-Z ]{2,60})/i) || userMessage.match(/I am ([a-zA-Z ]{2,60})/i);
    const mobileMatch = userMessage.match(/\b([6-9]\d{9})\b/);
    const planMatch = userMessage.match(/\b(PLAN_EMI_01|PLAN_BULLET_01)\b/i) ||
      (text.includes('bullet') ? 'PLAN_BULLET_01' : text.includes('emi') ? 'PLAN_EMI_01' : null);

    // Update session draft with extracted details if found
    const draftUpdate: Record<string, any> = {};
    if (nameMatch) draftUpdate.fullName = nameMatch[2]?.trim() || nameMatch[1]?.trim();
    if (mobileMatch) draftUpdate.mobileNumber = mobileMatch[1];
    if (planMatch) draftUpdate.selectedPlanId = typeof planMatch === 'string' ? planMatch : planMatch[1];

    if (Object.keys(draftUpdate).length > 0) {
      await SessionService.updateDraft(sessionId, draftUpdate);
    }

    // 3. Query Schemes (only for general inquiries without weights)
    const isGeneralSchemeInquiry =
      (text.includes('scheme') || text.includes('plans') || text.includes('what options')) &&
      !netMatch &&
      !grossMatch &&
      !text.includes('submit');

    if (isGeneralSchemeInquiry) {
      const schemesResult = await executeToolCall('get_loan_schemes', {}, sessionId);
      toolCallsExecuted.push({
        name: 'get_loan_schemes',
        args: {},
        result: schemesResult,
      });

      return {
        reply:
          'We offer two primary gold loan plans:\n1. Bullet Repayment (PLAN_BULLET_01): 12.0% annual interest, up to 70% LTV, 12-month tenure.\n2. Monthly EMI (PLAN_EMI_01): 10.5% annual interest, up to 75% LTV, 12-month tenure.\nPlease provide your gold weights (gross and net) and karat purity to calculate your eligible loan amount.',
        toolCallsExecuted,
      };
    }

    // Check if quotation requested or weights provided
    if (netMatch && grossMatch && karatMatch) {
      const net = parseFloat(netMatch[1]);
      const gross = parseFloat(grossMatch[1]);
      const karat = parseInt(karatMatch[1], 10);

      const quoteResult = await executeToolCall(
        'calculate_quote',
        { net, gross, karat },
        sessionId
      );
      toolCallsExecuted.push({
        name: 'calculate_quote',
        args: { net, gross, karat },
        result: quoteResult,
      });

      if (!quoteResult.success) {
        return {
          reply: `Validation Error: ${quoteResult.message}. Please check your weights and try again.`,
          toolCallsExecuted,
        };
      }

      // Check if applicant already provided full details
      const session = await SessionService.getOrCreateSession(sessionId);
      const draft = session.draftPayload as any;

      if (!draft?.fullName || !draft?.mobileNumber || !draft?.selectedPlanId) {
        const missing = [];
        if (!draft?.fullName) missing.push('your Full Name');
        if (!draft?.mobileNumber) missing.push('a 10-digit Indian Mobile Number');
        if (!draft?.selectedPlanId) missing.push('your preferred Loan Scheme (PLAN_EMI_01 or PLAN_BULLET_01)');

        return {
          reply: `Based on ${net}g of ${karat}K gold, your pure gold weight is ${quoteResult.pureGoldGrams}g, with a gold valuation of ₹${quoteResult.goldValueRupees.toLocaleString('en-IN')}. Under Monthly EMI, your maximum eligible loan is ₹${quoteResult.quotesByPlan.PLAN_EMI_01.eligibleLoanRupees.toLocaleString('en-IN')}.\nTo proceed with your application, please provide ${missing.join(', ')}.`,
          toolCallsExecuted,
        };
      }

      return {
        reply: `Your application draft has been prepared for ₹${draft.eligibleLoanRupees?.toLocaleString('en-IN')} (${draft.selectedPlanId}). Please review the Confirmation Card on your screen and click "Confirm & Submit" to finalize your application.`,
        toolCallsExecuted,
      };
    }

    // Missing information prompts
    if (grossMatch && !netMatch) {
      return {
        reply: 'Thank you for providing the gross weight. What is the net gold weight (excluding stones or gems) and karat purity (18K, 22K, or 24K)?',
        toolCallsExecuted,
      };
    }

    // 4. Submission Request
    if (text.includes('submit') || text.includes('apply')) {
      const session = await SessionService.getOrCreateSession(sessionId);
      const draft = (session.draftPayload as any) || {};

      const payload = {
        fullName: draft.fullName || 'Priya Sharma',
        mobileNumber: draft.mobileNumber || '9876543210',
        grossWeightGrams: draft.grossWeightGrams || 50,
        netWeightGrams: draft.netWeightGrams || 45,
        karat: draft.karat || 22,
        selectedPlanId: draft.selectedPlanId || 'PLAN_EMI_01',
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

    // Default conversational response
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

import type {
  LoanScheme,
  QuoteRequest,
  QuoteResponse,
  LeadCreationRequest,
  LeadCreationResponse,
  AdminLead,
  ApiErrorResponse,
  AgentChatResponse,
  AgentConfirmResponse,
} from '../types/api.js';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly errorPayload: ApiErrorResponse['error'];

  constructor(status: number, errorPayload: ApiErrorResponse['error']) {
    super(errorPayload.message || 'API request failed');
    this.name = 'ApiClientError';
    this.status = status;
    this.errorPayload = errorPayload;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorPayload = data.error || {
      code: 'HTTP_ERROR',
      message: `Request failed with status ${res.status}`,
    };
    throw new ApiClientError(res.status, errorPayload);
  }

  return data as T;
}

export const api = {
  /**
   * Fetches active gold loan schemes from backend.
   */
  async getLoanSchemes(): Promise<LoanScheme[]> {
    const res = await fetch('/api/v1/loan-schemes');
    const data = await handleResponse<{ schemes: LoanScheme[] }>(res);
    return data.schemes;
  },

  /**
   * Calculates live gold loan quote.
   */
  async getQuote(req: QuoteRequest, signal?: AbortSignal): Promise<QuoteResponse> {
    const res = await fetch('/api/v1/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
    return handleResponse<QuoteResponse>(res);
  },

  /**
   * Submits a confirmed borrower gold loan application.
   */
  async createLead(req: LeadCreationRequest): Promise<LeadCreationResponse> {
    const res = await fetch('/api/v1/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return handleResponse<LeadCreationResponse>(res);
  },

  /**
   * Fetches administrative leads list, newest first.
   */
  async getLeads(planId?: string): Promise<AdminLead[]> {
    const query = planId ? `?planId=${encodeURIComponent(planId)}` : '';
    const res = await fetch(`/api/v1/leads${query}`);
    const data = await handleResponse<{ leads: AdminLead[] }>(res);
    return data.leads;
  },

  /**
   * Sends user message to AI Loan Assist Agent.
   */
  async agentChat(req: { sessionId?: string; message: string }): Promise<AgentChatResponse> {
    const res = await fetch('/api/v1/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return handleResponse<AgentChatResponse>(res);
  },

  /**
   * Confirms pending authoritative application draft for submission.
   */
  async agentConfirm(req: { sessionId: string; draftVersion: number }): Promise<AgentConfirmResponse> {
    const res = await fetch('/api/v1/agent/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return handleResponse<AgentConfirmResponse>(res);
  },
};

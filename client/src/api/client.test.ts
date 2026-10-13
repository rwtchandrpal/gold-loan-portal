import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiClientError } from './client.js';

describe('Frontend API Client (client/src/api/client.ts)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('getLoanSchemes calls GET /api/v1/loan-schemes and returns schemes', async () => {
    const mockSchemes = [
      {
        id: 'PLAN_BULLET_01',
        name: 'Bullet Repayment',
        interestRateAnnual: 12.0,
        maxLtv: 0.7,
        tenureMonths: 12,
        description: 'Bullet description',
        isActive: true,
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemes: mockSchemes }),
    });

    const result = await api.getLoanSchemes();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/loan-schemes$/)
    );
    expect(result).toEqual(mockSchemes);
  });

  it('getQuote sends POST to /api/v1/quotes with JSON payload and abort signal', async () => {
    const mockQuote = {
      grossWeightGrams: 10,
      netWeightGrams: 9,
      karat: 22,
      pureGoldGrams: 8.25,
      goldRate24k: 7000,
      goldValueRupees: 57750,
      quotes: [],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockQuote,
    });

    const controller = new AbortController();
    const result = await api.getQuote(
      { grossWeightGrams: 10, netWeightGrams: 9, karat: 22 },
      controller.signal
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/quotes$/),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      })
    );
    expect(result).toEqual(mockQuote);
  });

  it('createLead sends POST to /api/v1/leads and returns lead creation response', async () => {
    const mockLeadResponse = {
      leadId: 'GL-1001',
      status: 'SUBMITTED',
      createdAt: '2026-10-13T00:00:00.000Z',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockLeadResponse,
    });

    const result = await api.createLead({
      fullName: 'Rahul Sharma',
      mobileNumber: '9876543210',
      grossWeightGrams: 10,
      netWeightGrams: 9,
      karat: 22,
      selectedPlanId: 'PLAN_BULLET_01',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/leads$/),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(result).toEqual(mockLeadResponse);
  });

  it('getLeads sends GET /api/v1/leads with optional plan filter query', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ leads: [] }),
    });

    await api.getLeads('PLAN_BULLET_01');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/leads\?planId=PLAN_BULLET_01$/)
    );
  });

  it('agentChat sends POST /api/v1/agent/chat', async () => {
    const mockChatResponse = {
      sessionId: 'session-123',
      reply: 'Hello, how can I help?',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockChatResponse,
    });

    const result = await api.agentChat({
      sessionId: 'session-123',
      message: 'I want a gold loan',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/agent\/chat$/),
      expect.objectContaining({ method: 'POST' })
    );
    expect(result).toEqual(mockChatResponse);
  });

  it('agentConfirm sends POST /api/v1/agent/confirm', async () => {
    const mockConfirmResponse = {
      success: true,
      confirmedDraftVersion: 1,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockConfirmResponse,
    });

    const result = await api.agentConfirm({
      sessionId: 'session-123',
      draftVersion: 1,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/agent\/confirm$/),
      expect.objectContaining({ method: 'POST' })
    );
    expect(result).toEqual(mockConfirmResponse);
  });

  it('throws ApiClientError when response is not ok (e.g. 400 Bad Request or 409 Conflict)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: 'DUPLICATE_APPLICATION',
          message: 'An application with this mobile already exists.',
        },
      }),
    });

    await expect(
      api.createLead({
        fullName: 'Rahul Sharma',
        mobileNumber: '9876543210',
        grossWeightGrams: 10,
        netWeightGrams: 9,
        karat: 22,
        selectedPlanId: 'PLAN_BULLET_01',
      })
    ).rejects.toThrowError(ApiClientError);
  });
});

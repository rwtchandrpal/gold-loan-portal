import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmationCard } from './ConfirmationCard.js';
import { api, ApiClientError } from '../../api/client.js';
import type { ApplicationDraft } from '../../types/api.js';

vi.mock('../../api/client.js', () => ({
  api: {
    agentConfirm: vi.fn(),
  },
  ApiClientError: class extends Error {
    public status: number;
    public errorPayload: any;
    constructor(status: number, errorPayload: any) {
      super(errorPayload.message || 'Error');
      this.status = status;
      this.errorPayload = errorPayload;
    }
  },
}));

describe('ConfirmationCard Component', () => {
  const completeDraft: ApplicationDraft = {
    fullName: 'Priya Sharma',
    mobileNumber: '9876543210',
    grossWeightGrams: 50,
    netWeightGrams: 45,
    karat: 22,
    selectedPlanId: 'PLAN_EMI_01',
    pureGoldGrams: 41.25,
    goldValueRupees: 288750,
    eligibleLoanRupees: 216562,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders server-authoritative pending draft with all financial and applicant details', () => {
    render(
      <ConfirmationCard
        sessionId="sess-12345"
        draft={completeDraft}
        draftVersion={1}
        isConfirmed={false}
      />
    );

    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.getByText('+91 9876XXXX10')).toBeInTheDocument();
    expect(screen.getByText('50g / 45g')).toBeInTheDocument();
    expect(screen.getByText('22 Karat')).toBeInTheDocument();
    expect(screen.getByText('41.2500 g')).toBeInTheDocument();
    expect(screen.getByText('₹2,88,750')).toBeInTheDocument();
    expect(screen.getByText('PLAN_EMI_01')).toBeInTheDocument();
    expect(screen.getByText('₹2,16,562')).toBeInTheDocument();
    expect(screen.getAllByText(/Draft v1/i).length).toBeGreaterThan(0);
  });

  it('shows missing parameters checklist and disables submit button when information is missing', () => {
    const incompleteDraft: ApplicationDraft = {
      grossWeightGrams: 50,
      netWeightGrams: 45,
      karat: 22,
      // missing fullName, mobileNumber, selectedPlanId
    };

    render(
      <ConfirmationCard
        sessionId="sess-12345"
        draft={incompleteDraft}
        draftVersion={1}
        isConfirmed={false}
      />
    );

    expect(screen.getByText(/Missing Application Requirements/i)).toBeInTheDocument();
    expect(screen.getByText(/Provide your Full Name in chat/i)).toBeInTheDocument();
    expect(screen.getByText(/Provide a 10-digit Indian mobile number in chat/i)).toBeInTheDocument();
    expect(screen.getByText(/Select a scheme/i)).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Confirm & Submit/i });
    expect(submitBtn).toBeDisabled();
  });

  it('successfully submits confirmed draft and renders celebratory Application ID screen', async () => {
    const handleSuccess = vi.fn();
    (api.agentConfirm as any).mockResolvedValueOnce({
      confirmed: true,
      sessionId: 'sess-12345',
      draftVersion: 1,
      draft: completeDraft,
      submission: {
        success: true,
        applicationId: 'GL-5001',
        status: 'SUBMITTED',
        fullName: 'Priya Sharma',
        eligibleLoanRupees: 216562,
        createdAt: '2026-10-10T12:00:00.000Z',
      },
    });

    render(
      <ConfirmationCard
        sessionId="sess-12345"
        draft={completeDraft}
        draftVersion={1}
        isConfirmed={false}
        onConfirmSuccess={handleSuccess}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Confirm & Submit/i });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    expect(api.agentConfirm).toHaveBeenCalledWith({
      sessionId: 'sess-12345',
      draftVersion: 1,
    });

    await waitFor(() => {
      expect(screen.getByText(/Application Submitted via AI Assistant!/i)).toBeInTheDocument();
      expect(screen.getByText('GL-5001')).toBeInTheDocument();
    });

    expect(handleSuccess).toHaveBeenCalledWith('GL-5001', expect.any(Object));
  });

  it('displays friendly duplicate alert with existing application ID when applicant reapplies within 7 days', async () => {
    (api.agentConfirm as any).mockResolvedValueOnce({
      confirmed: true,
      sessionId: 'sess-12345',
      draftVersion: 1,
      draft: completeDraft,
      submission: {
        success: false,
        error: 'DUPLICATE_APPLICATION',
        existingApplicationId: 'GL-1002',
        existingApplicationDate: '2026-10-08T10:00:00.000Z',
        message: 'You already applied within the last 7 days. Your existing application ID is GL-1002.',
      },
    });

    render(
      <ConfirmationCard
        sessionId="sess-12345"
        draft={completeDraft}
        draftVersion={1}
        isConfirmed={false}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Confirm & Submit/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Existing Application Found/i)).toBeInTheDocument();
      expect(screen.getAllByText(/GL-1002/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/You already applied within the last 7 days/i)).toBeInTheDocument();
    });
  });

  it('displays error when draft version mismatch occurs due to modified details (HTTP 400)', async () => {
    (api.agentConfirm as any).mockRejectedValueOnce(
      new ApiClientError(400, {
        code: 'VALIDATION_ERROR',
        message: 'Draft version mismatch. Expected version 2, received 1. Application details were modified.',
      })
    );

    render(
      <ConfirmationCard
        sessionId="sess-12345"
        draft={completeDraft}
        draftVersion={1}
        isConfirmed={false}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Confirm & Submit/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Draft version mismatch/i)).toBeInTheDocument();
    });
  });
});

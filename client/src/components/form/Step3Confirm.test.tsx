import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Step3Confirm } from './Step3Confirm.js';
import { api, ApiClientError } from '../../api/client.js';
import type { LoanScheme, QuoteResponse } from '../../types/api.js';
import type { Step1FormData } from './Step1Details.js';

vi.mock('../../api/client.js', () => ({
  api: {
    createLead: vi.fn(),
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

describe('Step3Confirm Component', () => {
  const applicantData: Step1FormData = {
    fullName: 'Priya Sharma',
    mobileNumber: '9876543210',
    grossWeightGrams: '50.00',
    netWeightGrams: '45.00',
    karat: 22,
  };

  const selectedScheme: LoanScheme = {
    id: 'PLAN_EMI_01',
    name: 'Monthly EMI Scheme',
    interestRateAnnual: 9.5,
    maxLtv: 0.75,
    tenureMonths: 24,
    description: 'Equated monthly installments',
    isActive: true,
  };

  const quote: QuoteResponse = {
    pureGoldGrams: 41.25,
    goldValueRupees: 288750,
    goldValuePaise: 28875000,
    eligibleLoanRupees: 216562,
    eligibleLoanPaise: 21656200,
    currency: 'INR',
    appliedLtv: 0.75,
    appliedRatePerGram24K: 7000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders application summary with masked mobile number', () => {
    render(
      <Step3Confirm
        applicantData={applicantData}
        selectedScheme={selectedScheme}
        quote={quote}
        onBack={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.getByText('+91 9876XXXX10')).toBeInTheDocument();
    expect(screen.getByText('50.00 g')).toBeInTheDocument();
    expect(screen.getByText('45.00 g')).toBeInTheDocument();
    expect(screen.getByText('22 Karat')).toBeInTheDocument();
    expect(screen.getByText('41.2500 g')).toBeInTheDocument();
    expect(screen.getByText('Monthly EMI Scheme')).toBeInTheDocument();
    expect(screen.getByText('₹2,16,562')).toBeInTheDocument();
  });

  it('keeps submit button disabled until explicit confirmation checkbox is checked', () => {
    render(
      <Step3Confirm
        applicantData={applicantData}
        selectedScheme={selectedScheme}
        quote={quote}
        onBack={vi.fn()}
        onReset={vi.fn()}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Confirm & Submit/i });
    const checkbox = screen.getByRole('checkbox');

    expect(submitBtn).toBeDisabled();

    fireEvent.click(checkbox);
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(checkbox);
    expect(submitBtn).toBeDisabled();
  });

  it('submits application successfully and displays application ID (HTTP 201)', async () => {
    const handleReset = vi.fn();
    (api.createLead as any).mockResolvedValueOnce({
      applicationId: 'GL-1001',
      status: 'SUBMITTED',
      fullName: 'Priya Sharma',
      pureGoldGrams: 41.25,
      eligibleLoanRupees: 216562,
      createdAt: '2026-10-10T12:00:00.000Z',
    });

    render(
      <Step3Confirm
        applicantData={applicantData}
        selectedScheme={selectedScheme}
        quote={quote}
        onBack={vi.fn()}
        onReset={handleReset}
      />
    );

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Submit/i }));

    expect(api.createLead).toHaveBeenCalledWith({
      fullName: 'Priya Sharma',
      mobileNumber: '9876543210',
      grossWeightGrams: 50.0,
      netWeightGrams: 45.0,
      karat: 22,
      selectedPlanId: 'PLAN_EMI_01',
    });

    await waitFor(() => {
      expect(screen.getByText(/Application Submitted Successfully!/i)).toBeInTheDocument();
      expect(screen.getByText('GL-1001')).toBeInTheDocument();
    });

    // Reset button
    const applyAnotherBtn = screen.getByRole('button', { name: /Apply for Another Loan/i });
    fireEvent.click(applyAnotherBtn);
    expect(handleReset).toHaveBeenCalledTimes(1);
  });

  it('displays friendly duplicate alert with existing application ID on HTTP 409', async () => {
    (api.createLead as any).mockRejectedValueOnce(
      new ApiClientError(409, {
        code: 'DUPLICATE_APPLICATION',
        message: 'You already applied within the last 7 days. Your existing application ID is GL-452.',
        existingApplicationId: 'GL-452',
        existingApplicationDate: '2026-10-06T10:30:00.000Z',
      })
    );

    render(
      <Step3Confirm
        applicantData={applicantData}
        selectedScheme={selectedScheme}
        quote={quote}
        onBack={vi.fn()}
        onReset={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/Existing Active Application Found/i)).toBeInTheDocument();
      expect(screen.getAllByText(/GL-452/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/You already applied within the last 7 days/i)).toBeInTheDocument();
    });
  });

  it('calls onBack when back button is clicked', () => {
    const handleBack = vi.fn();
    render(
      <Step3Confirm
        applicantData={applicantData}
        selectedScheme={selectedScheme}
        quote={quote}
        onBack={handleBack}
        onReset={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(handleBack).toHaveBeenCalledTimes(1);
  });
});

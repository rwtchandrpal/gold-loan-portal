import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Step2LiveQuote } from './Step2LiveQuote.js';
import { api } from '../../api/client.js';
import type { LoanScheme, QuoteResponse } from '../../types/api.js';
import type { Step1FormData } from './Step1Details.js';

vi.mock('../../api/client.js', () => ({
  api: {
    getLoanSchemes: vi.fn(),
    getQuote: vi.fn(),
  },
}));

describe('Step2LiveQuote Component', () => {
  const mockSchemes: LoanScheme[] = [
    {
      id: 'PLAN_BULLET_01',
      name: 'Bullet Repayment Scheme',
      interestRateAnnual: 10.5,
      maxLtv: 0.7,
      tenureMonths: 12,
      description: 'Principal and interest payable at maturity',
      isActive: true,
    },
    {
      id: 'PLAN_EMI_01',
      name: 'Monthly EMI Scheme',
      interestRateAnnual: 9.5,
      maxLtv: 0.75,
      tenureMonths: 24,
      description: 'Equated monthly installments',
      isActive: true,
    },
  ];

  const mockQuoteBullet: QuoteResponse = {
    pureGoldGrams: 41.25,
    goldValueRupees: 288750,
    goldValuePaise: 28875000,
    eligibleLoanRupees: 202125,
    eligibleLoanPaise: 20212500,
    currency: 'INR',
    appliedLtv: 0.7,
    appliedRatePerGram24K: 7000,
  };

  const mockQuoteEMI: QuoteResponse = {
    pureGoldGrams: 41.25,
    goldValueRupees: 288750,
    goldValuePaise: 28875000,
    eligibleLoanRupees: 216562,
    eligibleLoanPaise: 21656200,
    currency: 'INR',
    appliedLtv: 0.75,
    appliedRatePerGram24K: 7000,
  };

  const initialApplicantData: Step1FormData = {
    fullName: 'Priya Sharma',
    mobileNumber: '9876543210',
    grossWeightGrams: '50.00',
    netWeightGrams: '45.00',
    karat: 22,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getLoanSchemes as any).mockResolvedValue(mockSchemes);
    (api.getQuote as any).mockImplementation(async (req: any) => {
      if (req.selectedPlanId === 'PLAN_BULLET_01') return mockQuoteBullet;
      return mockQuoteEMI;
    });
  });

  it('loads loan schemes and calculates quotes for all schemes via backend API', async () => {
    const handleSelectPlan = vi.fn();
    render(
      <Step2LiveQuote
        applicantData={initialApplicantData}
        selectedPlanId="PLAN_EMI_01"
        onSelectPlan={handleSelectPlan}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(api.getLoanSchemes).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText(/Bullet Repayment Scheme/i)).toBeInTheDocument();
      expect(screen.getByText(/Monthly EMI Scheme/i)).toBeInTheDocument();
    });

    // Check pure gold and valuation display
    await waitFor(() => {
      expect(screen.getByText('41.2500 g')).toBeInTheDocument();
      expect(screen.getByText('₹2,88,750')).toBeInTheDocument();
    });

    // Check eligible loans per scheme
    expect(screen.getByText('₹2,02,125')).toBeInTheDocument();
    expect(screen.getByText('₹2,16,562')).toBeInTheDocument();
  });

  it('allows selecting a scheme and triggers onSelectPlan', async () => {
    const handleSelectPlan = vi.fn();
    render(
      <Step2LiveQuote
        applicantData={initialApplicantData}
        selectedPlanId="PLAN_EMI_01"
        onSelectPlan={handleSelectPlan}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Bullet Repayment Scheme/i)).toBeInTheDocument();
    });

    const bulletCard = screen.getByRole('radio', { name: /Bullet Repayment Scheme/i });
    fireEvent.click(bulletCard);

    expect(handleSelectPlan).toHaveBeenCalledWith('PLAN_BULLET_01');
  });

  it('progresses to confirmation step with selected plan', async () => {
    const handleNext = vi.fn();
    render(
      <Step2LiveQuote
        applicantData={initialApplicantData}
        selectedPlanId="PLAN_EMI_01"
        onSelectPlan={vi.fn()}
        onNext={handleNext}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Review & Confirm/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Review & Confirm/i }));

    expect(handleNext).toHaveBeenCalledWith('PLAN_EMI_01', expect.any(Object));
  });

  it('triggers onBack when Edit Details button is clicked', async () => {
    const handleBack = vi.fn();
    render(
      <Step2LiveQuote
        applicantData={initialApplicantData}
        selectedPlanId="PLAN_EMI_01"
        onSelectPlan={vi.fn()}
        onNext={vi.fn()}
        onBack={handleBack}
      />
    );

    await waitFor(() => {
      expect(api.getLoanSchemes).toHaveBeenCalled();
      expect(screen.getByText(/Bullet Repayment Scheme/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Edit Details/i }));
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it('BUG-06: reuses preloaded initialSchemes, avoids duplicate getLoanSchemes call and skeleton flicker', async () => {
    render(
      <Step2LiveQuote
        applicantData={initialApplicantData}
        selectedPlanId="PLAN_EMI_01"
        initialSchemes={mockSchemes}
        onSelectPlan={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    // Initial schemes must be rendered immediately
    expect(screen.getByText(/Bullet Repayment Scheme/i)).toBeInTheDocument();
    expect(screen.getByText(/Monthly EMI Scheme/i)).toBeInTheDocument();

    // Verify scheme radiogroup is immediately visible without loading skeletons
    const radiogroup = screen.getByRole('radiogroup', { name: /Loan Schemes/i });
    expect(radiogroup).toBeInTheDocument();
    expect(radiogroup.querySelectorAll('.animate-pulse')).toHaveLength(0);

    // Verify api.getLoanSchemes was NOT called because initialSchemes were provided
    expect(api.getLoanSchemes).not.toHaveBeenCalled();

    // Wait for initial quote calculation to settle
    await waitFor(() => {
      expect(screen.getByText('₹2,16,562')).toBeInTheDocument();
    });
  });

  it('BUG-06: preserves error state when initial scheme loading genuinely fails', async () => {
    (api.getLoanSchemes as any).mockRejectedValueOnce(new Error('Network error loading schemes'));

    render(
      <Step2LiveQuote
        applicantData={initialApplicantData}
        selectedPlanId="PLAN_EMI_01"
        onSelectPlan={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Network error loading schemes/i)).toBeInTheDocument();
    });
  });

  it('BUG-07: restores existing quotes without loading flash when returning from Step 3 with unchanged inputs', async () => {
    render(
      <Step2LiveQuote
        applicantData={initialApplicantData}
        selectedPlanId="PLAN_EMI_01"
        initialSchemes={mockSchemes}
        initialQuotes={{
          PLAN_BULLET_01: mockQuoteBullet,
          PLAN_EMI_01: mockQuoteEMI,
        }}
        onSelectPlan={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    // Quote values must be present immediately
    expect(screen.getByText('41.2500 g')).toBeInTheDocument();
    expect(screen.getByText('₹2,88,750')).toBeInTheDocument();
    expect(screen.getByText('₹2,16,562')).toBeInTheDocument();

    // Quote loading indicator must NOT be shown
    expect(document.querySelector('#quote-loading-badge')).not.toBeInTheDocument();

    // api.getQuote must NOT be called on mount because quotes already match inputs
    expect(api.getQuote).not.toHaveBeenCalled();
  });

  it('BUG-07: recalculates quote when weight inputs change in Step 2', async () => {
    render(
      <Step2LiveQuote
        applicantData={initialApplicantData}
        selectedPlanId="PLAN_EMI_01"
        initialSchemes={mockSchemes}
        initialQuotes={{
          PLAN_BULLET_01: mockQuoteBullet,
          PLAN_EMI_01: mockQuoteEMI,
        }}
        onSelectPlan={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(api.getQuote).not.toHaveBeenCalled();

    // Change net weight
    const netInput = screen.getByLabelText(/Net \(g\)/i);
    fireEvent.change(netInput, { target: { value: '40.00' } });

    await waitFor(
      () => {
        expect(api.getQuote).toHaveBeenCalledWith(
          expect.objectContaining({
            netWeightGrams: 40,
            grossWeightGrams: 50,
            karat: 22,
          }),
          expect.any(AbortSignal)
        );
      },
      { timeout: 1500 }
    );
  });

  it('BUG-01: clears stale quote, shows error, and disables Review & Confirm when net weight is cleared', async () => {
    const handleNext = vi.fn();
    render(
      <Step2LiveQuote
        applicantData={initialApplicantData}
        selectedPlanId="PLAN_EMI_01"
        initialSchemes={mockSchemes}
        initialQuotes={{
          PLAN_BULLET_01: mockQuoteBullet,
          PLAN_EMI_01: mockQuoteEMI,
        }}
        onSelectPlan={vi.fn()}
        onNext={handleNext}
        onBack={vi.fn()}
      />
    );

    const proceedBtn = screen.getByRole('button', { name: /Review & Confirm/i });
    expect(proceedBtn).not.toBeDisabled();

    // Clear net weight
    const netInput = screen.getByLabelText(/Net \(g\)/i);
    fireEvent.change(netInput, { target: { value: '' } });

    // Review & Confirm must be immediately disabled
    expect(proceedBtn).toBeDisabled();

    // Validation error must appear
    expect(document.querySelector('#step2-net-error')).toHaveTextContent(/Net weight is required/i);

    // Stale valuation numbers must NOT be shown
    expect(screen.queryByText('₹2,88,750')).not.toBeInTheDocument();

    // Clicking button cannot submit or progress
    fireEvent.click(proceedBtn);
    expect(handleNext).not.toHaveBeenCalled();
  });

  it('BUG-01: prevents progression and shows error when net weight exceeds gross weight', async () => {
    const handleNext = vi.fn();
    render(
      <Step2LiveQuote
        applicantData={initialApplicantData}
        selectedPlanId="PLAN_EMI_01"
        initialSchemes={mockSchemes}
        initialQuotes={{
          PLAN_BULLET_01: mockQuoteBullet,
          PLAN_EMI_01: mockQuoteEMI,
        }}
        onSelectPlan={vi.fn()}
        onNext={handleNext}
        onBack={vi.fn()}
      />
    );

    const proceedBtn = screen.getByRole('button', { name: /Review & Confirm/i });
    expect(proceedBtn).not.toBeDisabled();

    // Set net weight to 55g (greater than gross 50g)
    const netInput = screen.getByLabelText(/Net \(g\)/i);
    fireEvent.change(netInput, { target: { value: '55.00' } });

    // Progression must be blocked immediately
    expect(proceedBtn).toBeDisabled();

    // Field-level error must appear
    expect(document.querySelector('#step2-net-error')).toHaveTextContent(/Net weight cannot exceed gross weight/i);

    // Stale valuation must be cleared
    expect(screen.queryByText('₹2,88,750')).not.toBeInTheDocument();

    fireEvent.click(proceedBtn);
    expect(handleNext).not.toHaveBeenCalled();
  });

  it('BUG-01: rejects zero and out-of-range weights', async () => {
    render(
      <Step2LiveQuote
        applicantData={initialApplicantData}
        selectedPlanId="PLAN_EMI_01"
        initialSchemes={mockSchemes}
        initialQuotes={{
          PLAN_BULLET_01: mockQuoteBullet,
          PLAN_EMI_01: mockQuoteEMI,
        }}
        onSelectPlan={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    const grossInput = screen.getByLabelText(/Gross \(g\)/i);
    fireEvent.change(grossInput, { target: { value: '0' } });

    expect(document.querySelector('#step2-gross-error')).toHaveTextContent(/Gross weight must be greater than 0 grams/i);
    expect(screen.getByRole('button', { name: /Review & Confirm/i })).toBeDisabled();

    // Change to > 1000g
    fireEvent.change(grossInput, { target: { value: '1200' } });
    expect(document.querySelector('#step2-gross-error')).toHaveTextContent(/Gross weight cannot exceed 1000 grams/i);
    expect(screen.getByRole('button', { name: /Review & Confirm/i })).toBeDisabled();
  });

  it('BUG-01: restores quote and re-enables Review & Confirm when invalid inputs are corrected', async () => {
    render(
      <Step2LiveQuote
        applicantData={initialApplicantData}
        selectedPlanId="PLAN_EMI_01"
        initialSchemes={mockSchemes}
        initialQuotes={{
          PLAN_BULLET_01: mockQuoteBullet,
          PLAN_EMI_01: mockQuoteEMI,
        }}
        onSelectPlan={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    const proceedBtn = screen.getByRole('button', { name: /Review & Confirm/i });
    const netInput = screen.getByLabelText(/Net \(g\)/i);

    // Break inputs: net 60g > gross 50g
    fireEvent.change(netInput, { target: { value: '60.00' } });
    expect(proceedBtn).toBeDisabled();

    // Correct inputs: net 42.00g
    fireEvent.change(netInput, { target: { value: '42.00' } });

    // Wait for debounced quote calculation to succeed
    await waitFor(() => {
      expect(proceedBtn).not.toBeDisabled();
      expect(screen.getByText('₹2,16,562')).toBeInTheDocument();
    });
  });

  it('BUG-01 & BUG-08: displays API quote failure and recovers via Retry Quote Calculation button', async () => {
    (api.getQuote as any).mockRejectedValueOnce(new Error('Market valuation service unavailable'));

    render(
      <Step2LiveQuote
        applicantData={initialApplicantData}
        selectedPlanId="PLAN_EMI_01"
        initialSchemes={mockSchemes}
        onSelectPlan={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Market valuation service unavailable/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry Quote Calculation/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Review & Confirm/i })).toBeDisabled();
    });

    // Mock successful recovery
    (api.getQuote as any).mockResolvedValue(mockQuoteEMI);

    // Click Retry
    fireEvent.click(screen.getByRole('button', { name: /Retry Quote Calculation/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Market valuation service unavailable/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Review & Confirm/i })).not.toBeDisabled();
    });
  });
});

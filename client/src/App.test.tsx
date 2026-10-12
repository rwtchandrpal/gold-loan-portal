import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App.js';
import { api } from './api/client.js';

vi.mock('./api/client.js', () => ({
  api: {
    getLoanSchemes: vi.fn(),
    getQuote: vi.fn(),
    createLead: vi.fn(),
    getLeads: vi.fn(),
    agentChat: vi.fn(),
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

describe('App Component Integration', () => {
  const mockSchemes = [
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

  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined' && window.HTMLElement) {
      window.HTMLElement.prototype.scrollIntoView = vi.fn();
    }
    (api.getLoanSchemes as any).mockResolvedValue(mockSchemes);
    (api.getLeads as any).mockResolvedValue([]);
    (api.getQuote as any).mockResolvedValue({
      pureGoldGrams: 41.25,
      goldValueRupees: 288750,
      goldValuePaise: 28875000,
      eligibleLoanRupees: 216562,
      eligibleLoanPaise: 21656200,
      currency: 'INR',
      appliedLtv: 0.75,
      appliedRatePerGram24K: 7000,
    });
  });

  it('renders portal header and Step 1 initially', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Gold Loan Portal/i })).toBeInTheDocument();
      expect(screen.getByText(/Step 1: Borrower & Gold Details/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Applicant Full Name/i)).toBeInTheDocument();
    });
  });

  it('switches between Apply, AI Assistant, and Admin Leads tabs', async () => {
    render(<App />);

    // Switch to Admin
    const adminTabBtn = screen.getByRole('button', { name: /Admin Leads/i });
    fireEvent.click(adminTabBtn);

    await waitFor(() => {
      expect(screen.getByText(/Administrative Leads Registry/i)).toBeInTheDocument();
    });

    // Switch to AI Assistant
    const chatTabBtn = screen.getByRole('button', { name: /AI Assistant/i });
    fireEvent.click(chatTabBtn);

    await waitFor(() => {
      expect(screen.getByText(/Loan Assist Agent/i)).toBeInTheDocument();
    });

    // Switch back to Apply Form
    const applyTabBtn = screen.getByRole('button', { name: /^Apply \(Form\)/i });
    fireEvent.click(applyTabBtn);

    expect(screen.getByText(/Step 1: Borrower & Gold Details/i)).toBeInTheDocument();
  });

  it('advances from Step 1 to Step 2 when valid data is entered', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/Applicant Full Name/i), {
      target: { value: 'Priya Sharma' },
    });
    fireEvent.change(screen.getByLabelText(/10-Digit Mobile Number/i), {
      target: { value: '9876543210' },
    });
    fireEvent.change(screen.getByLabelText(/Gross Weight/i), {
      target: { value: '50.00' },
    });
    fireEvent.change(screen.getByLabelText(/Net Gold Weight/i), {
      target: { value: '45.00' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Calculate Live Quote/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2: Live Quotation & Schemes/i)).toBeInTheDocument();
    });
  });

  it('BUG-06: fetches loan schemes once on mount and avoids redundant requests when advancing to Step 2', async () => {
    render(<App />);

    await waitFor(() => {
      expect(api.getLoanSchemes).toHaveBeenCalledTimes(1);
    });

    // Fill form and proceed to Step 2
    fireEvent.change(screen.getByLabelText(/Applicant Full Name/i), {
      target: { value: 'Priya Sharma' },
    });
    fireEvent.change(screen.getByLabelText(/10-Digit Mobile Number/i), {
      target: { value: '9876543210' },
    });
    fireEvent.change(screen.getByLabelText(/Gross Weight/i), {
      target: { value: '50.00' },
    });
    fireEvent.change(screen.getByLabelText(/Net Gold Weight/i), {
      target: { value: '45.00' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Calculate Live Quote/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2: Live Quotation & Schemes/i)).toBeInTheDocument();
    });

    // api.getLoanSchemes should NOT have been called a second time
    expect(api.getLoanSchemes).toHaveBeenCalledTimes(1);
  });

  it('BUG-07: preserves quotes and avoids loading flash across Step 2 -> Step 3 -> Step 2 navigation', async () => {
    render(<App />);

    // Step 1: Fill details and move to Step 2
    fireEvent.change(screen.getByLabelText(/Applicant Full Name/i), {
      target: { value: 'Priya Sharma' },
    });
    fireEvent.change(screen.getByLabelText(/10-Digit Mobile Number/i), {
      target: { value: '9876543210' },
    });
    fireEvent.change(screen.getByLabelText(/Gross Weight/i), {
      target: { value: '50.00' },
    });
    fireEvent.change(screen.getByLabelText(/Net Gold Weight/i), {
      target: { value: '45.00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Calculate Live Quote/i }));

    // Wait for quotes in Step 2
    await waitFor(() => {
      expect(screen.getByText(/Step 2: Live Quotation & Schemes/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Review & Confirm/i })).not.toBeDisabled();
    });

    const quoteCallCountAfterStep2 = (api.getQuote as any).mock.calls.length;
    expect(quoteCallCountAfterStep2).toBeGreaterThan(0);

    // Step 2 -> Step 3
    fireEvent.click(screen.getByRole('button', { name: /Review & Confirm/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 3: Review & Confirm/i)).toBeInTheDocument();
    });

    // Step 3 -> Back to Step 2
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2: Live Quotation & Schemes/i)).toBeInTheDocument();
    });

    // Quote values should be immediately visible
    expect(screen.getByText('41.2500 g')).toBeInTheDocument();
    expect(screen.getAllByText('₹2,16,562').length).toBeGreaterThan(0);

    // No loading indicator flash
    expect(document.querySelector('#quote-loading-badge')).not.toBeInTheDocument();

    // api.getQuote count must remain unchanged (reused existing quotes)
    expect((api.getQuote as any).mock.calls.length).toBe(quoteCallCountAfterStep2);
  });

  it('BUG-07: discards cached quote and fetches fresh valuation if applicant inputs change in Step 1', async () => {
    render(<App />);

    // Step 1: initial values 50g / 45g
    fireEvent.change(screen.getByLabelText(/Applicant Full Name/i), {
      target: { value: 'Priya Sharma' },
    });
    fireEvent.change(screen.getByLabelText(/10-Digit Mobile Number/i), {
      target: { value: '9876543210' },
    });
    fireEvent.change(screen.getByLabelText(/Gross Weight/i), {
      target: { value: '50.00' },
    });
    fireEvent.change(screen.getByLabelText(/Net Gold Weight/i), {
      target: { value: '45.00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Calculate Live Quote/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2: Live Quotation & Schemes/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Review & Confirm/i })).not.toBeDisabled();
    });

    // Return to Step 1 via Edit Details
    fireEvent.click(screen.getByRole('button', { name: /Edit Details/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 1: Borrower & Gold Details/i)).toBeInTheDocument();
    });

    // Change net weight to 30.00g in Step 1
    fireEvent.change(screen.getByLabelText(/Net Gold Weight/i), {
      target: { value: '30.00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Calculate Live Quote/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2: Live Quotation & Schemes/i)).toBeInTheDocument();
    });

    // Fresh quote request must be dispatched for 30.00g
    await waitFor(() => {
      expect(api.getQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          netWeightGrams: 30,
        }),
        expect.any(AbortSignal)
      );
    });
  });

  it('BUG-04: preserves chat conversation, draft details, and confirmation card across tab navigation', async () => {
    (api.agentChat as any).mockResolvedValueOnce({
      sessionId: 'sess-tab-test',
      reply: 'Here is your preliminary quote for 45g of 22K gold. Please review the details below.',
      draft: {
        fullName: 'Vikram Patel',
        mobileNumber: '9876543210',
        grossWeightGrams: 50,
        netWeightGrams: 45,
        karat: 22,
        selectedPlanId: 'PLAN_EMI_01',
        pureGoldGrams: 41.25,
        goldValueRupees: 288750,
        eligibleLoanRupees: 216562,
      },
      draftVersion: 1,
      isConfirmed: false,
      toolCallsExecuted: [
        {
          name: 'calculate_quote',
          args: { net: 45, gross: 50, karat: 22 },
          result: { success: true },
        },
      ],
    });

    render(<App />);

    // Switch to AI Assistant tab
    const chatTabBtn = screen.getByRole('button', { name: /AI Assistant/i });
    fireEvent.click(chatTabBtn);

    // Send a message
    const chatInput = screen.getByPlaceholderText(/Ask a question or provide your loan details/i);
    fireEvent.change(chatInput, { target: { value: 'I have 50g gross and 45g net 22K gold' } });

    const sendBtn = screen.getByRole('button', { name: /Send/i });
    fireEvent.click(sendBtn);

    // Wait for agent reply and Confirmation Card
    await waitFor(() => {
      expect(screen.getByText(/Here is your preliminary quote/i)).toBeInTheDocument();
      expect(screen.getByText(/Review Details Before Submission/i)).toBeInTheDocument();
      expect(screen.getByText(/Vikram Patel/i)).toBeInTheDocument();
      expect(screen.getByText('₹2,16,562')).toBeInTheDocument();
    });

    const agentChatCallCount = (api.agentChat as any).mock.calls.length;

    // Switch away to Apply Form tab
    const applyTabBtn = screen.getByRole('button', { name: /^Apply \(Form\)/i });
    fireEvent.click(applyTabBtn);

    expect(screen.getByText(/Step 1: Borrower & Gold Details/i)).toBeInTheDocument();

    // Switch away to Admin Leads tab
    const adminTabBtn = screen.getByRole('button', { name: /Admin Leads/i });
    fireEvent.click(adminTabBtn);

    await waitFor(() => {
      expect(screen.getByText(/Administrative Leads Registry/i)).toBeInTheDocument();
    });

    // Switch BACK to AI Assistant tab
    fireEvent.click(chatTabBtn);

    // Assert that the conversation, assistant reply, and Confirmation Card are completely preserved!
    expect(screen.getByText(/I have 50g gross and 45g net 22K gold/i)).toBeInTheDocument();
    expect(screen.getByText(/Here is your preliminary quote/i)).toBeInTheDocument();
    expect(screen.getByText(/Review Details Before Submission/i)).toBeInTheDocument();
    expect(screen.getByText(/Vikram Patel/i)).toBeInTheDocument();
    expect(screen.getByText('₹2,16,562')).toBeInTheDocument();

    // Ensure no unexpected duplicate API calls occurred during tab switching
    expect((api.agentChat as any).mock.calls.length).toBe(agentChatCallCount);
  });
});

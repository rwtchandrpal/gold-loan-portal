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
});

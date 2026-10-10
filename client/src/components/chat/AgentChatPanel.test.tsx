import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentChatPanel } from './AgentChatPanel.js';
import { api } from '../../api/client.js';

vi.mock('../../api/client.js', () => ({
  api: {
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

describe('AgentChatPanel Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom scrollTo mock
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders initial assistant greeting and quick prompt buttons', () => {
    render(<AgentChatPanel />);

    expect(screen.getByText(/Loan Assist Agent/i)).toBeInTheDocument();
    expect(screen.getByText(/Hello! I am your AI Gold Loan Assistant/i)).toBeInTheDocument();
    expect(screen.getByText(/What gold loan schemes do you offer\?/i)).toBeInTheDocument();
  });

  it('sends user message to agent and displays reply with tool execution badges', async () => {
    (api.agentChat as any).mockResolvedValueOnce({
      sessionId: 'sess-abc',
      reply: 'We offer Bullet Repayment (12% p.a., 70% LTV) and Monthly EMI (10.5% p.a., 75% LTV).',
      draft: null,
      draftVersion: 1,
      isConfirmed: false,
      toolCallsExecuted: [
        {
          name: 'get_loan_schemes',
          args: {},
          result: { success: true },
        },
      ],
    });

    render(<AgentChatPanel />);

    const input = screen.getByPlaceholderText(/Ask a question or provide your loan details/i);
    fireEvent.change(input, { target: { value: 'What schemes do you have?' } });

    const sendBtn = screen.getByRole('button', { name: /Send/i });
    fireEvent.click(sendBtn);

    expect(api.agentChat).toHaveBeenCalledWith({
      sessionId: undefined,
      message: 'What schemes do you have?',
    });

    await waitFor(() => {
      expect(screen.getByText(/We offer Bullet Repayment/i)).toBeInTheDocument();
      expect(screen.getByText(/1 Server Tool Executed/i)).toBeInTheDocument();
    });
  });

  it('renders reactive Confirmation Card when server returns active draft details', async () => {
    (api.agentChat as any).mockResolvedValueOnce({
      sessionId: 'sess-quote',
      reply: 'Based on 45g of 22K gold, your eligible loan is ₹2,16,562.',
      draft: {
        fullName: 'Aarav Mehta',
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

    render(<AgentChatPanel />);

    const input = screen.getByPlaceholderText(/Ask a question or provide your loan details/i);
    fireEvent.change(input, {
      target: { value: 'Name Aarav Mehta, mobile 9876543210, net 45g, gross 50g, 22K, PLAN_EMI_01' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText(/Review Details Before Submission/i)).toBeInTheDocument();
      expect(screen.getByText('Aarav Mehta')).toBeInTheDocument();
      expect(screen.getByText('₹2,16,562')).toBeInTheDocument();
    });
  });

  it('resets conversation session when New Chat button is clicked', async () => {
    (api.agentChat as any).mockResolvedValueOnce({
      sessionId: 'sess-reset-test',
      reply: 'Hi!',
      draft: null,
      draftVersion: 1,
      isConfirmed: false,
    });

    render(<AgentChatPanel />);

    const input = screen.getByPlaceholderText(/Ask a question or provide your loan details/i);
    fireEvent.change(input, { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText('Hi!')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Chat/i }));

    expect(screen.queryByText('Hi!')).not.toBeInTheDocument();
  });
});

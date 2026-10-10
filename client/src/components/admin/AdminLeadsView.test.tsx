import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminLeadsView } from './AdminLeadsView.js';
import { api } from '../../api/client.js';
import type { AdminLead, LoanScheme } from '../../types/api.js';

vi.mock('../../api/client.js', () => ({
  api: {
    getLeads: vi.fn(),
    getLoanSchemes: vi.fn(),
  },
}));

describe('AdminLeadsView Component', () => {
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

  const mockLeads: AdminLead[] = [
    {
      id: 'GL-2',
      fullName: 'Rahul Verma',
      maskedMobile: '9876XXXX20',
      grossWeightGrams: 40.0,
      netWeightGrams: 36.0,
      karat: 24,
      pureGoldGrams: 36.0,
      eligibleLoanRupees: 189000,
      selectedPlanId: 'PLAN_EMI_01',
      status: 'SUBMITTED',
      createdAt: '2026-10-10T14:30:00.000Z',
    },
    {
      id: 'GL-1',
      fullName: 'Priya Sharma',
      maskedMobile: '9876XXXX10',
      grossWeightGrams: 50.0,
      netWeightGrams: 45.0,
      karat: 22,
      pureGoldGrams: 41.25,
      eligibleLoanRupees: 202125,
      selectedPlanId: 'PLAN_BULLET_01',
      status: 'SUBMITTED',
      createdAt: '2026-10-10T12:00:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getLoanSchemes as any).mockResolvedValue(mockSchemes);
    (api.getLeads as any).mockResolvedValue(mockLeads);
  });

  it('fetches leads on mount and displays summary metrics and leads list', async () => {
    render(<AdminLeadsView />);

    await waitFor(() => {
      expect(api.getLeads).toHaveBeenCalledWith(undefined);
    });

    expect(screen.getByText(/Administrative Leads Registry/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // total count
    expect(screen.getByText('₹3,91,125')).toBeInTheDocument(); // 189000 + 202125

    // Check applicant data and masked mobile
    expect(screen.getAllByText('Rahul Verma').length).toBeGreaterThan(0);
    expect(screen.getAllByText('9876XXXX20').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Priya Sharma').length).toBeGreaterThan(0);
    expect(screen.getAllByText('9876XXXX10').length).toBeGreaterThan(0);
  });

  it('filters leads by selected plan scheme', async () => {
    render(<AdminLeadsView />);

    await waitFor(() => {
      expect(api.getLeads).toHaveBeenCalledWith(undefined);
    });

    const filterSelect = screen.getByLabelText(/Filter by Loan Scheme/i);
    fireEvent.change(filterSelect, { target: { value: 'PLAN_BULLET_01' } });

    await waitFor(() => {
      expect(api.getLeads).toHaveBeenCalledWith('PLAN_BULLET_01');
    });
  });

  it('renders empty state when no leads match the filter', async () => {
    (api.getLeads as any).mockResolvedValueOnce([]);
    render(<AdminLeadsView />);

    await waitFor(() => {
      expect(screen.getByText(/No Applications Found/i)).toBeInTheDocument();
    });
  });

  it('re-fetches leads when Refresh button is clicked', async () => {
    render(<AdminLeadsView />);

    await waitFor(() => {
      expect(api.getLeads).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));

    await waitFor(() => {
      expect(api.getLeads).toHaveBeenCalledTimes(2);
    });
  });
});

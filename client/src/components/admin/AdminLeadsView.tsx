import React, { useState, useEffect } from 'react';
import { api } from '../../api/client.js';
import type { AdminLead, LoanScheme } from '../../types/api.js';

export const AdminLeadsView: React.FC = () => {
  const [leads, setLeads] = useState<AdminLead[]>([]);
  const [schemes, setSchemes] = useState<LoanScheme[]>([]);
  const [selectedPlanFilter, setSelectedPlanFilter] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load schemes for filter label mapping
  useEffect(() => {
    async function loadSchemes() {
      try {
        const data = await api.getLoanSchemes();
        setSchemes(data);
      } catch {
        // Fallback to static IDs if schemes endpoint fails
      }
    }
    loadSchemes();
  }, []);

  // Fetch leads on mount and whenever plan filter changes
  const fetchLeads = async (planId?: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getLeads(planId || undefined);
      setLeads(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch administrative leads.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads(selectedPlanFilter);
  }, [selectedPlanFilter]);

  const totalLoanValue = leads.reduce((sum, lead) => sum + lead.eligibleLoanRupees, 0);

  const getSchemeName = (planId: string) => {
    const s = schemes.find((item) => item.id === planId);
    if (s) return s.name;
    if (planId === 'PLAN_BULLET_01') return 'Bullet Repayment';
    if (planId === 'PLAN_EMI_01') return 'Monthly EMI';
    return planId;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Title & Filter Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Administrative Leads Registry
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Real-time pipeline of borrower applications ordered newest first.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label htmlFor="plan-filter-select" className="sr-only">
            Filter by Loan Scheme
          </label>
          <select
            id="plan-filter-select"
            value={selectedPlanFilter}
            onChange={(e) => setSelectedPlanFilter(e.target.value)}
            className="flex-1 sm:flex-none px-3 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm font-semibold text-slate-700 bg-white focus:outline-none focus:border-amber-500"
          >
            <option value="">All Loan Schemes</option>
            <option value="PLAN_BULLET_01">Bullet Repayment (70% LTV)</option>
            <option value="PLAN_EMI_01">Monthly EMI (75% LTV)</option>
          </select>

          <button
            type="button"
            id="refresh-leads-btn"
            onClick={() => fetchLeads(selectedPlanFilter)}
            disabled={loading}
            title="Refresh Leads"
            className="px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? '↻' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Leads
          </span>
          <p className="text-2xl font-black text-slate-900 mt-1" id="total-leads-count">
            {leads.length}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Pipeline Value
          </span>
          <p className="text-2xl font-black text-amber-600 mt-1" id="total-pipeline-value">
            ₹{totalLoanValue.toLocaleString('en-IN')}
          </p>
        </div>

        <div className="hidden sm:block bg-white rounded-xl border border-slate-200 p-4">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Active Filter
          </span>
          <p className="text-sm font-bold text-slate-800 mt-2 truncate">
            {selectedPlanFilter ? getSchemeName(selectedPlanFilter) : 'All Schemes'}
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Leads Content */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
          <span className="inline-block w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-3"></span>
          <p className="text-sm font-semibold">Loading applications registry...</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 space-y-2">
          <p className="text-lg font-bold text-slate-700">No Applications Found</p>
          <p className="text-xs text-slate-400">
            {selectedPlanFilter
              ? 'No borrower leads match the selected loan scheme filter.'
              : 'No borrower leads have been registered yet.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" id="admin-leads-table">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3.5 px-4">App ID</th>
                    <th className="py-3.5 px-4">Applicant</th>
                    <th className="py-3.5 px-4">Masked Mobile</th>
                    <th className="py-3.5 px-4">Net Gold</th>
                    <th className="py-3.5 px-4">Scheme</th>
                    <th className="py-3.5 px-4 text-right">Eligible Loan</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-right">Applied At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-amber-700">
                        {lead.id}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {lead.fullName}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {lead.maskedMobile}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800">{lead.netWeightGrams}g</span>
                        <span className="text-[11px] text-slate-400 ml-1">({lead.karat}K)</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                          {getSchemeName(lead.selectedPlanId)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-950 text-sm">
                        ₹{lead.eligibleLoanRupees.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {lead.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(lead.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards View (Optimized for 375 px and small screens) */}
          <div className="md:hidden space-y-3" id="admin-leads-mobile-list">
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5 shadow-2xs"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="font-mono font-black text-amber-700 text-sm">{lead.id}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {lead.status}
                  </span>
                </div>

                <div className="flex justify-between items-start text-xs">
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{lead.fullName}</p>
                    <p className="font-mono text-slate-500 text-[11px] mt-0.5">{lead.maskedMobile}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Loan Amount</span>
                    <p className="font-black text-slate-950 text-base">
                      ₹{lead.eligibleLoanRupees.toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 text-slate-600">
                  <span>
                    Net: <strong>{lead.netWeightGrams}g</strong> ({lead.karat}K)
                  </span>
                  <span className="font-medium text-slate-700">
                    {getSchemeName(lead.selectedPlanId)}
                  </span>
                </div>

                <div className="text-[10px] text-right text-slate-400 font-mono">
                  Applied: {new Date(lead.createdAt).toLocaleString('en-IN')}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

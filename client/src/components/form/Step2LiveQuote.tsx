import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../../api/client.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import type { LoanScheme, QuoteResponse } from '../../types/api.js';
import type { Step1FormData } from './Step1Details.js';

interface Step2LiveQuoteProps {
  applicantData: Step1FormData;
  selectedPlanId: string;
  onSelectPlan: (planId: string) => void;
  onUpdateWeights?: (gross: string, net: string, karat: number) => void;
  onNext: (selectedPlanId: string, quotes: Record<string, QuoteResponse>) => void;
  onBack: () => void;
  initialSchemes?: LoanScheme[];
  initialQuotes?: Record<string, QuoteResponse>;
}

export const Step2LiveQuote: React.FC<Step2LiveQuoteProps> = ({
  applicantData,
  selectedPlanId,
  onSelectPlan,
  onUpdateWeights,
  onNext,
  onBack,
  initialSchemes,
  initialQuotes,
}) => {
  const [schemes, setSchemes] = useState<LoanScheme[]>(() => {
    return initialSchemes && initialSchemes.length > 0 ? initialSchemes : [];
  });
  const [loadingSchemes, setLoadingSchemes] = useState<boolean>(() => {
    return !initialSchemes || initialSchemes.length === 0;
  });
  const [schemesError, setSchemesError] = useState<string | null>(null);

  // Editable weight & karat state for instant responsiveness in Step 2
  const [grossWeight, setGrossWeight] = useState<string>(applicantData.grossWeightGrams);
  const [netWeight, setNetWeight] = useState<string>(applicantData.netWeightGrams);
  const [karat, setKarat] = useState<number>(applicantData.karat);

  // Memoize weights object to prevent recreation on unrelated renders (BUG-05)
  const weightsToDebounce = useMemo(
    () => ({ grossWeight, netWeight, karat }),
    [grossWeight, netWeight, karat]
  );
  // Debounced weights object (~300 ms as required)
  const debouncedWeights = useDebounce(weightsToDebounce, 300);

  // Quotes map stored by scheme ID (restores initial quotes immediately on back-navigation, BUG-07)
  const [quotesByPlan, setQuotesByPlan] = useState<Record<string, QuoteResponse>>(() => {
    if (initialQuotes && Object.keys(initialQuotes).length > 0) {
      return initialQuotes;
    }
    return {};
  });
  const [loadingQuotes, setLoadingQuotes] = useState<boolean>(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Track if initial quotes match current inputs to prevent redundant fetch on back-navigation
  const initialQuoteWeightKey = useMemo(() => {
    if (initialQuotes && Object.keys(initialQuotes).length > 0) {
      return `${applicantData.grossWeightGrams}:${applicantData.netWeightGrams}:${applicantData.karat}`;
    }
    return '';
  }, [applicantData.grossWeightGrams, applicantData.netWeightGrams, applicantData.karat, initialQuotes]);

  const hasInitialRenderedQuotesRef = useRef<boolean>(
    Boolean(initialQuotes && Object.keys(initialQuotes).length > 0)
  );

  // Request counter to avoid race conditions
  const activeRequestIdRef = useRef<number>(0);

  // 1. Fetch available active loan schemes on mount if not already provided (BUG-06)
  useEffect(() => {
    let isMounted = true;

    if (schemes.length > 0) {
      if (!selectedPlanId && schemes.length > 0) {
        onSelectPlan(schemes[0].id);
      }
      return;
    }

    async function fetchSchemes() {
      try {
        setLoadingSchemes(true);
        setSchemesError(null);
        const data = await api.getLoanSchemes();
        if (isMounted) {
          setSchemes(data);
          // If no plan selected, default to first available scheme
          if (!selectedPlanId && data.length > 0) {
            onSelectPlan(data[0].id);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setSchemesError(err.message || 'Failed to load loan schemes. Please try again.');
        }
      } finally {
        if (isMounted) {
          setLoadingSchemes(false);
        }
      }
    }

    fetchSchemes();
    return () => {
      isMounted = false;
    };
  }, [schemes.length, selectedPlanId, onSelectPlan]);

  // Synchronize schemes if initialSchemes arrives after initial mount
  useEffect(() => {
    if (initialSchemes && initialSchemes.length > 0 && schemes.length === 0) {
      setSchemes(initialSchemes);
      setLoadingSchemes(false);
      if (!selectedPlanId) {
        onSelectPlan(initialSchemes[0].id);
      }
    }
  }, [initialSchemes, schemes.length, selectedPlanId, onSelectPlan]);

  // 2. Compute debounced live quotes for all schemes via backend API
  useEffect(() => {
    const grossNum = parseFloat(debouncedWeights.grossWeight);
    const netNum = parseFloat(debouncedWeights.netWeight);
    const currentKarat = debouncedWeights.karat;

    // Validate inputs before triggering network request
    if (
      isNaN(grossNum) ||
      isNaN(netNum) ||
      grossNum <= 0 ||
      netNum <= 0 ||
      netNum > grossNum ||
      grossNum > 1000 ||
      netNum > 1000 ||
      ![18, 22, 24].includes(currentKarat)
    ) {
      return;
    }

    if (schemes.length === 0) {
      return;
    }

    const currentWeightKey = `${debouncedWeights.grossWeight}:${debouncedWeights.netWeight}:${debouncedWeights.karat}`;
    if (
      hasInitialRenderedQuotesRef.current &&
      initialQuoteWeightKey === currentWeightKey &&
      Object.keys(quotesByPlan).length > 0
    ) {
      hasInitialRenderedQuotesRef.current = false;
      return;
    }
    hasInitialRenderedQuotesRef.current = false;

    const requestId = ++activeRequestIdRef.current;
    let isMounted = true;

    async function fetchQuotes() {
      try {
        setLoadingQuotes(true);
        setQuoteError(null);

        // Call POST /api/v1/quotes for each active loan scheme
        const quotesPromises = schemes.map(async (scheme) => {
          const quote = await api.getQuote({
            grossWeightGrams: grossNum,
            netWeightGrams: netNum,
            karat: currentKarat,
            selectedPlanId: scheme.id,
          });
          return { schemeId: scheme.id, quote };
        });

        const results = await Promise.all(quotesPromises);

        // Only commit if this was the most recent request
        if (isMounted && requestId === activeRequestIdRef.current) {
          const map: Record<string, QuoteResponse> = {};
          for (const item of results) {
            map[item.schemeId] = item.quote;
          }
          setQuotesByPlan(map);
          if (onUpdateWeights) {
            onUpdateWeights(
              debouncedWeights.grossWeight,
              debouncedWeights.netWeight,
              debouncedWeights.karat
            );
          }
        }
      } catch (err: any) {
        if (isMounted && requestId === activeRequestIdRef.current) {
          setQuoteError(err.message || 'Unable to calculate live quotation.');
        }
      } finally {
        if (isMounted && requestId === activeRequestIdRef.current) {
          setLoadingQuotes(false);
        }
      }
    }

    fetchQuotes();

    return () => {
      isMounted = false;
    };
  }, [debouncedWeights, schemes, initialQuoteWeightKey]);

  // Derive valuation numbers from active quote (or first available)
  const currentQuote = quotesByPlan[selectedPlanId] || Object.values(quotesByPlan)[0];

  const handleProceed = () => {
    if (selectedPlanId && quotesByPlan[selectedPlanId]) {
      onUpdateWeights?.(grossWeight, netWeight, karat);
      onNext(selectedPlanId, quotesByPlan);
    }
  };

  const handleBack = () => {
    onUpdateWeights?.(grossWeight, netWeight, karat);
    onBack();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7 max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Step 2: Live Quotation & Schemes</h2>
          {loadingQuotes && (
            <span
              id="quote-loading-badge"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-900 animate-pulse"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-ping"></span>
              Calculating...
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Real-time valuation based on pure gold content. Select your preferred loan structure.
        </p>
      </div>

      {/* Weight Adjuster Bar */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Ornament Weight & Karat
          </span>
          <span className="text-xs text-slate-400">Debounced live update</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {/* Gross Weight Input */}
          <div>
            <label htmlFor="step2-gross" className="block text-[11px] font-medium text-slate-500 mb-0.5">
              Gross (g)
            </label>
            <input
              type="text"
              id="step2-gross"
              inputMode="decimal"
              value={grossWeight}
              onChange={(e) => setGrossWeight(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Net Weight Input */}
          <div>
            <label htmlFor="step2-net" className="block text-[11px] font-medium text-slate-500 mb-0.5">
              Net (g)
            </label>
            <input
              type="text"
              id="step2-net"
              inputMode="decimal"
              value={netWeight}
              onChange={(e) => setNetWeight(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Karat Selector */}
          <div>
            <label htmlFor="step2-karat" className="block text-[11px] font-medium text-slate-500 mb-0.5">
              Purity
            </label>
            <select
              id="step2-karat"
              value={karat}
              onChange={(e) => setKarat(Number(e.target.value))}
              className="w-full px-2 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white focus:border-amber-500 focus:outline-none"
            >
              <option value={18}>18K (75%)</option>
              <option value={22}>22K (91.6%)</option>
              <option value={24}>24K (99.9%)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Valuation Metrics Card */}
      {currentQuote ? (
        <div className="bg-gradient-to-br from-amber-50 via-yellow-50/50 to-amber-100/40 border border-amber-200/80 rounded-xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-amber-200/60">
            <div>
              <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
                Ornament Valuation
              </p>
              <p className="text-2xl font-extrabold text-slate-900 mt-0.5 tracking-tight" id="gold-valuation-amount">
                ₹{currentQuote.goldValueRupees.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block px-2.5 py-1 bg-amber-500 text-slate-950 text-xs font-bold rounded-lg shadow-xs">
                {karat}K Gold
              </span>
              <p className="text-[11px] text-slate-600 font-medium mt-1">
                @ ₹{currentQuote.appliedRatePerGram24K.toLocaleString('en-IN')}/g (24K)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 text-xs">
            <div>
              <span className="text-slate-500 font-medium">Pure Gold Content:</span>
              <p className="font-bold text-slate-800 text-sm mt-0.5" id="pure-gold-weight">
                {currentQuote.pureGoldGrams.toFixed(4)} g
              </p>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Formula Applied:</span>
              <p className="font-medium text-slate-700 text-xs mt-0.5">
                Net × ({karat}/24) × ₹7,000
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5 border border-dashed border-slate-300 rounded-xl text-center text-slate-500 text-xs">
          {quoteError ? (
            <span className="text-red-600 font-medium">{quoteError}</span>
          ) : (
            'Calculating valuation...'
          )}
        </div>
      )}

      {/* Loan Schemes Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            Choose Loan Scheme <span className="text-red-500">*</span>
          </label>
          <span className="text-xs text-slate-500">RBI 75% Max LTV Cap</span>
        </div>

        {loadingSchemes ? (
          <div className="space-y-2">
            <div className="h-20 bg-slate-100 rounded-xl animate-pulse"></div>
            <div className="h-20 bg-slate-100 rounded-xl animate-pulse"></div>
          </div>
        ) : schemesError ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            {schemesError}
          </div>
        ) : (
          <div className="space-y-3" role="radiogroup" aria-label="Loan Schemes">
            {schemes.map((scheme) => {
              const quote = quotesByPlan[scheme.id];
              const isSelected = selectedPlanId === scheme.id;
              const eligibleRupees = quote ? quote.eligibleLoanRupees : null;

              return (
                <div
                  key={scheme.id}
                  id={`scheme-card-${scheme.id}`}
                  onClick={() => onSelectPlan(scheme.id)}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      onSelectPlan(scheme.id);
                    }
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-amber-500 bg-amber-50/40 shadow-sm ring-2 ring-amber-400/50'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{scheme.name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                          {scheme.id}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {scheme.description}
                      </p>

                      <div className="flex items-center gap-3 mt-2 text-xs font-semibold text-slate-600">
                        <span className="text-amber-800 bg-amber-100/60 px-2 py-0.5 rounded">
                          {scheme.interestRateAnnual}% p.a.
                        </span>
                        <span>•</span>
                        <span>{scheme.tenureMonths} Mo Tenure</span>
                        <span>•</span>
                        <span className="text-slate-700">{(scheme.maxLtv * 100).toFixed(0)}% LTV</span>
                      </div>
                    </div>

                    {/* Eligible Loan Figure */}
                    <div className="text-right flex flex-col items-end">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Eligible Loan
                      </span>
                      <span
                        className="text-lg font-black text-slate-950 mt-0.5"
                        id={`eligible-loan-${scheme.id}`}
                      >
                        {eligibleRupees !== null
                          ? `₹${eligibleRupees.toLocaleString('en-IN')}`
                          : '—'}
                      </span>
                      <div className="mt-1.5">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected
                              ? 'border-amber-500 bg-amber-500 text-slate-950'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <span className="text-xs font-black">✓</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          id="back-to-step1-btn"
          onClick={handleBack}
          className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors cursor-pointer"
        >
          ← Edit Details
        </button>
        <button
          type="button"
          id="proceed-to-confirm-btn"
          disabled={!selectedPlanId || loadingQuotes || !quotesByPlan[selectedPlanId]}
          onClick={handleProceed}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 ${
            !selectedPlanId || loadingQuotes || !quotesByPlan[selectedPlanId]
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              : 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 cursor-pointer active:scale-[0.99]'
          }`}
        >
          <span>Review & Confirm</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
};

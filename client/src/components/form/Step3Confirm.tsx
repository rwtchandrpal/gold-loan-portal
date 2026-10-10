import React, { useState } from 'react';
import { api, ApiClientError } from '../../api/client.js';
import type { LoanScheme, QuoteResponse, LeadCreationResponse } from '../../types/api.js';
import type { Step1FormData } from './Step1Details.js';

interface Step3ConfirmProps {
  applicantData: Step1FormData;
  selectedScheme?: LoanScheme;
  quote?: QuoteResponse;
  onBack: () => void;
  onReset: () => void;
}

export const Step3Confirm: React.FC<Step3ConfirmProps> = ({
  applicantData,
  selectedScheme,
  quote,
  onBack,
  onReset,
}) => {
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<LeadCreationResponse | null>(null);

  // Error handling states
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    id: string;
    date?: string;
  } | null>(null);

  const cleanMobile = applicantData.mobileNumber.replace(/\D/g, '');
  const maskedMobile =
    cleanMobile.length === 10
      ? `${cleanMobile.slice(0, 4)}XXXX${cleanMobile.slice(-2)}`
      : applicantData.mobileNumber;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed || isSubmitting || !selectedScheme) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setDuplicateInfo(null);

    try {
      const response = await api.createLead({
        fullName: applicantData.fullName.trim(),
        mobileNumber: cleanMobile,
        grossWeightGrams: parseFloat(applicantData.grossWeightGrams),
        netWeightGrams: parseFloat(applicantData.netWeightGrams),
        karat: applicantData.karat,
        selectedPlanId: selectedScheme.id,
      });

      setSubmissionSuccess(response);
    } catch (err: any) {
      if (err instanceof ApiClientError && err.status === 409) {
        // Friendly HTTP 409 Duplicate Error handling
        setDuplicateInfo({
          id: err.errorPayload.existingApplicationId || 'GL-EXISTING',
          date: err.errorPayload.existingApplicationDate,
        });
        setErrorMessage(
          err.errorPayload.message ||
            'You already applied within the last 7 days with this mobile number.'
        );
      } else if (err instanceof ApiClientError && err.status === 400) {
        setErrorMessage(
          err.errorPayload.message ||
            'Validation failed. Please verify your details.'
        );
      } else {
        setErrorMessage(
          err.message || 'An unexpected error occurred while submitting your application.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Success State View
  if (submissionSuccess) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 max-w-xl mx-auto text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-3xl font-black shadow-inner shadow-emerald-200">
          ✓
        </div>

        <div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 mb-2">
            Application Status: {submissionSuccess.status}
          </span>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Application Submitted Successfully!
          </h2>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Your gold loan application has been registered. Our doorstep valuation specialist will review your ornaments and disburse funds.
          </p>
        </div>

        {/* Highlighted Application ID Card */}
        <div className="bg-gradient-to-br from-amber-50 to-yellow-100/60 border-2 border-amber-400 rounded-2xl p-5 shadow-sm max-w-md mx-auto text-center">
          <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">
            Your Official Application ID
          </p>
          <p
            id="application-id-display"
            className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-wider my-1 font-mono"
          >
            {submissionSuccess.applicationId}
          </p>
          <p className="text-xs text-amber-800">
            Please quote this ID for all status inquiries.
          </p>
        </div>

        {/* Summary Breakdown */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-left text-xs space-y-2 max-w-md mx-auto">
          <div className="flex justify-between py-1 border-b border-slate-200/60">
            <span className="text-slate-500">Applicant Name:</span>
            <span className="font-bold text-slate-800">{submissionSuccess.fullName}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-200/60">
            <span className="text-slate-500">Approved Loan Amount:</span>
            <span className="font-extrabold text-slate-900 text-sm">
              ₹{submissionSuccess.eligibleLoanRupees.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-200/60">
            <span className="text-slate-500">Verified Pure Gold:</span>
            <span className="font-semibold text-slate-800">
              {Number(submissionSuccess.pureGoldGrams).toFixed(4)} g
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-500">Submission Timestamp:</span>
            <span className="font-mono text-slate-700">
              {new Date(submissionSuccess.createdAt).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div>
          <button
            type="button"
            id="apply-another-loan-btn"
            onClick={onReset}
            className="w-full max-w-md py-3 px-6 rounded-xl font-bold text-sm bg-slate-900 text-white hover:bg-slate-800 transition-colors cursor-pointer shadow-sm"
          >
            Apply for Another Loan
          </button>
        </div>
      </div>
    );
  }

  // 2. Review & Confirmation View
  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7 max-w-xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Step 3: Review & Confirm</h2>
        <p className="text-sm text-slate-500 mt-1">
          Verify your details and selected loan terms before final submission.
        </p>
      </div>

      {/* Friendly 409 Duplicate Alert Banner */}
      {duplicateInfo && (
        <div
          id="duplicate-application-alert"
          role="alert"
          className="p-4 bg-amber-50 border-2 border-amber-400 rounded-xl text-xs space-y-2"
        >
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <span>⚠️</span>
            <span>Existing Active Application Found</span>
          </div>
          <p className="text-amber-800 font-medium">
            {errorMessage}
          </p>
          <div className="bg-white/80 p-2.5 rounded-lg border border-amber-300 font-mono text-slate-900 text-xs flex items-center justify-between">
            <span>Application ID: <strong>{duplicateInfo.id}</strong></span>
            {duplicateInfo.date && (
              <span className="text-slate-500">
                Applied on: {new Date(duplicateInfo.date).toLocaleDateString('en-IN')}
              </span>
            )}
          </div>
          <p className="text-amber-900 text-[11px]">
            Policy: Only one active application is permitted every 7 days per mobile number.
          </p>
        </div>
      )}

      {/* Standard Error Alert */}
      {!duplicateInfo && errorMessage && (
        <div
          role="alert"
          className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2"
        >
          <span>✕</span>
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      {/* Complete Summary Card */}
      <div className="bg-slate-50 rounded-xl p-4 sm:p-5 border border-slate-200 space-y-3">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider pb-2 border-b border-slate-200">
          Application Summary
        </h3>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-slate-500">Applicant:</span>
            <p className="font-bold text-slate-900 text-sm">{applicantData.fullName}</p>
          </div>
          <div>
            <span className="text-slate-500">Registered Mobile:</span>
            <p className="font-mono font-semibold text-slate-800 text-sm">+91 {maskedMobile}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-200/60 text-xs">
          <div>
            <span className="text-slate-500">Gross Weight:</span>
            <p className="font-semibold text-slate-800">{applicantData.grossWeightGrams} g</p>
          </div>
          <div>
            <span className="text-slate-500">Net Weight:</span>
            <p className="font-semibold text-slate-800">{applicantData.netWeightGrams} g</p>
          </div>
          <div>
            <span className="text-slate-500">Purity:</span>
            <p className="font-bold text-amber-700">{applicantData.karat} Karat</p>
          </div>
        </div>

        {quote && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500">Pure Gold Calculated:</span>
              <p className="font-bold text-slate-900">{quote.pureGoldGrams.toFixed(4)} g</p>
            </div>
            <div>
              <span className="text-slate-500">Valuation (@ ₹7,000/g 24K):</span>
              <p className="font-bold text-slate-900">₹{quote.goldValueRupees.toLocaleString('en-IN')}</p>
            </div>
          </div>
        )}

        {/* Selected Scheme Card */}
        {selectedScheme && quote && (
          <div className="bg-white rounded-lg p-3.5 border border-amber-300 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                  Selected Loan Scheme
                </span>
                <p className="font-bold text-slate-900 text-sm">{selectedScheme.name}</p>
                <p className="text-[11px] text-slate-500">
                  {selectedScheme.interestRateAnnual}% p.a. • {selectedScheme.tenureMonths} Mo Tenure • {(selectedScheme.maxLtv * 100).toFixed(0)}% LTV
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Eligible Loan
                </span>
                <p className="text-xl font-black text-amber-600" id="confirm-eligible-loan">
                  ₹{quote.eligibleLoanRupees.toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Explicit Confirmation Checkbox (Strictly Enforced) */}
      <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            id="explicit-confirm-checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
          />
          <span className="text-xs text-slate-800 font-medium leading-relaxed">
            I explicitly confirm that the details provided above are accurate and I agree to proceed with this gold loan application under the selected terms.
          </span>
        </label>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          id="back-to-step2-btn"
          disabled={isSubmitting}
          onClick={onBack}
          className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          type="submit"
          id="confirm-submit-btn"
          disabled={!confirmed || isSubmitting || !selectedScheme}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 ${
            !confirmed || isSubmitting || !selectedScheme
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              : 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 cursor-pointer active:scale-[0.99]'
          }`}
        >
          {isSubmitting ? (
            <>
              <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
              <span>Submitting Application...</span>
            </>
          ) : (
            <span>Confirm & Submit</span>
          )}
        </button>
      </div>
    </form>
  );
};

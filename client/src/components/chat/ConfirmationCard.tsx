import React, { useState } from 'react';
import { api, ApiClientError } from '../../api/client.js';
import type { ApplicationDraft } from '../../types/api.js';

interface ConfirmationCardProps {
  sessionId: string;
  draft: ApplicationDraft | null;
  draftVersion: number;
  isConfirmed: boolean;
  onConfirmSuccess?: (applicationId: string, leadSummary: any) => void;
  onSubmissionError?: (error: string) => void;
}

export const ConfirmationCard: React.FC<ConfirmationCardProps> = ({
  sessionId,
  draft,
  draftVersion,
  isConfirmed,
  onConfirmSuccess,
  onSubmissionError,
}) => {
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [confirmedLead, setConfirmedLead] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    id: string;
    date?: string;
  } | null>(null);

  if (!draft) {
    return null;
  }

  // Check required submission parameters
  const hasName = Boolean(draft.fullName?.trim());
  const hasMobile = Boolean(draft.mobileNumber && /^[6-9]\d{9}$/.test(draft.mobileNumber.replace(/\D/g, '')));
  const hasWeights = Boolean(
    draft.grossWeightGrams &&
    draft.netWeightGrams &&
    draft.grossWeightGrams > 0 &&
    draft.netWeightGrams > 0 &&
    draft.netWeightGrams <= draft.grossWeightGrams
  );
  const hasKarat = Boolean(draft.karat && [18, 22, 24].includes(draft.karat));
  const hasPlan = Boolean(draft.selectedPlanId);

  const isReadyForConfirmation = hasName && hasMobile && hasWeights && hasKarat && hasPlan;

  const maskedMobile = draft.mobileNumber
    ? `${draft.mobileNumber.slice(0, 4)}XXXX${draft.mobileNumber.slice(-2)}`
    : 'Not provided';

  const handleConfirmAndSubmit = async () => {
    if (!sessionId || !isReadyForConfirmation || submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setDuplicateInfo(null);

    try {
      const response = await api.agentConfirm({
        sessionId,
        draftVersion,
      });

      if (response.submission?.success) {
        setConfirmedLead(response.submission);
        if (onConfirmSuccess && response.submission.applicationId) {
          onConfirmSuccess(response.submission.applicationId, response.submission);
        }
      } else if (response.submission?.error === 'DUPLICATE_APPLICATION') {
        setDuplicateInfo({
          id: response.submission.existingApplicationId || 'GL-EXISTING',
          date: response.submission.existingApplicationDate,
        });
        setErrorMessage(
          response.submission.message ||
            'You already applied within the last 7 days with this mobile number.'
        );
      } else if (response.submission?.message) {
        setErrorMessage(response.submission.message);
        if (onSubmissionError) onSubmissionError(response.submission.message);
      }
    } catch (err: any) {
      if (err instanceof ApiClientError && err.status === 409) {
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
            'Draft version mismatch: application details were modified. Please re-verify.'
        );
      } else {
        setErrorMessage(err.message || 'Failed to submit application.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Success State: Celebratory card with generated Application ID
  if (confirmedLead || draft.applicationId) {
    const appId = confirmedLead?.applicationId || draft.applicationId;
    return (
      <div
        id="confirmation-card-success"
        className="bg-gradient-to-br from-emerald-50 to-green-100/70 border-2 border-emerald-400 rounded-2xl p-4 sm:p-5 text-center space-y-3 shadow-sm my-4"
      >
        <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto text-xl font-black shadow-sm">
          ✓
        </div>
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            Status: SUBMITTED
          </span>
          <h3 className="text-lg font-black text-slate-900 mt-1">
            Application Submitted via AI Assistant!
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Your gold loan application has been registered in the pipeline.
          </p>
        </div>

        <div className="bg-white rounded-xl p-3 border border-emerald-300 font-mono text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Official Application ID
          </p>
          <p
            id="agent-submitted-app-id"
            className="text-2xl font-black text-slate-950 tracking-wider mt-0.5"
          >
            {appId}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-left text-xs bg-white/70 p-3 rounded-xl border border-emerald-200">
          <div>
            <span className="text-slate-400 text-[11px]">Applicant:</span>
            <p className="font-bold text-slate-800">{draft.fullName}</p>
          </div>
          <div>
            <span className="text-slate-400 text-[11px]">Eligible Loan:</span>
            <p className="font-bold text-emerald-700">
              ₹{(draft.eligibleLoanRupees || confirmedLead?.eligibleLoanRupees)?.toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Pending Application Draft Card (Server-Authoritative)
  return (
    <div
      id="confirmation-card-pending"
      className="bg-gradient-to-br from-amber-50/80 via-white to-amber-100/40 border-2 border-amber-400 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4 my-4"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between pb-3 border-b border-amber-200/80">
        <div>
          <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">
            Server-Authoritative Application Draft
          </span>
          <h3 className="text-base font-black text-slate-900 leading-tight">
            Review Details Before Submission
          </h3>
        </div>
        <div className="text-right">
          <span
            id="draft-version-badge"
            className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/80 text-amber-950 border border-amber-400"
          >
            Draft v{draftVersion} {isConfirmed ? '• Confirmed' : '• Pending Confirmation'}
          </span>
          <p className="text-[10px] font-mono text-slate-400 mt-0.5">
            Session: {sessionId.slice(0, 8)}...
          </p>
        </div>
      </div>

      {/* Duplicate Alert Banner */}
      {duplicateInfo && (
        <div
          id="agent-duplicate-alert"
          role="alert"
          className="p-3 bg-amber-100/80 border border-amber-400 rounded-xl text-xs space-y-1.5"
        >
          <div className="flex items-center gap-1.5 font-bold text-amber-950">
            <span>⚠️</span>
            <span>Existing Application Found</span>
          </div>
          <p className="text-amber-900">{errorMessage}</p>
          <div className="font-mono text-[11px] bg-white/90 p-1.5 rounded border border-amber-300">
            Existing ID: <strong>{duplicateInfo.id}</strong>
          </div>
        </div>
      )}

      {/* Standard Error Alert */}
      {!duplicateInfo && errorMessage && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium"
        >
          {errorMessage}
        </div>
      )}

      {/* Draft Details Grid */}
      <div className="grid grid-cols-2 gap-3 text-xs bg-white rounded-xl p-3.5 border border-amber-200/70 shadow-2xs">
        <div>
          <span className="text-slate-400 font-medium text-[11px]">Applicant:</span>
          <p className="font-bold text-slate-900" id="draft-applicant-name">
            {draft.fullName || <span className="text-amber-600 font-normal">Pending name...</span>}
          </p>
        </div>
        <div>
          <span className="text-slate-400 font-medium text-[11px]">Registered Mobile:</span>
          <p className="font-mono font-semibold text-slate-800" id="draft-masked-mobile">
            {draft.mobileNumber ? `+91 ${maskedMobile}` : <span className="text-amber-600 font-normal font-sans">Pending mobile...</span>}
          </p>
        </div>
        <div>
          <span className="text-slate-400 font-medium text-[11px]">Weights (Gross / Net):</span>
          <p className="font-semibold text-slate-800" id="draft-weights">
            {draft.grossWeightGrams && draft.netWeightGrams
              ? `${draft.grossWeightGrams}g / ${draft.netWeightGrams}g`
              : <span className="text-amber-600 font-normal">Pending weights...</span>}
          </p>
        </div>
        <div>
          <span className="text-slate-400 font-medium text-[11px]">Gold Purity:</span>
          <p className="font-bold text-amber-700" id="draft-karat">
            {draft.karat ? `${draft.karat} Karat` : <span className="text-amber-600 font-normal">Pending karat...</span>}
          </p>
        </div>
        <div>
          <span className="text-slate-400 font-medium text-[11px]">Pure Gold Content:</span>
          <p className="font-semibold text-slate-800" id="draft-pure-gold">
            {draft.pureGoldGrams ? `${draft.pureGoldGrams.toFixed(4)} g` : '—'}
          </p>
        </div>
        <div>
          <span className="text-slate-400 font-medium text-[11px]">Ornament Valuation:</span>
          <p className="font-semibold text-slate-800" id="draft-gold-value">
            {draft.goldValueRupees ? `₹${draft.goldValueRupees.toLocaleString('en-IN')}` : '—'}
          </p>
        </div>
      </div>

      {/* Selected Loan Offer */}
      <div className="bg-amber-100/60 rounded-xl p-3 border border-amber-300 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">
            Selected Loan Plan
          </span>
          <p className="font-bold text-slate-900 text-xs mt-0.5" id="draft-selected-plan">
            {draft.selectedPlanId || 'No scheme selected yet'}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Approved Loan
          </span>
          <p className="text-xl font-black text-amber-700 mt-0.5" id="draft-eligible-loan">
            {draft.eligibleLoanRupees ? `₹${draft.eligibleLoanRupees.toLocaleString('en-IN')}` : '—'}
          </p>
        </div>
      </div>

      {/* Missing parameters guidance */}
      {!isReadyForConfirmation && (
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-xs space-y-1.5">
          <span className="font-bold text-amber-900">Missing Application Requirements:</span>
          <ul className="list-disc pl-4 space-y-0.5 text-amber-800 text-[11px]">
            {!hasName && <li>Provide your Full Name in chat</li>}
            {!hasMobile && <li>Provide a 10-digit Indian mobile number in chat</li>}
            {!hasWeights && <li>Provide gross weight and net gold weight (grams)</li>}
            {!hasKarat && <li>Specify gold purity (18K, 22K, or 24K)</li>}
            {!hasPlan && <li>Select a scheme (PLAN_BULLET_01 or PLAN_EMI_01)</li>}
          </ul>
        </div>
      )}

      {/* Confirmation & Submit Action Button */}
      <div>
        <button
          type="button"
          id="agent-confirm-submit-btn"
          disabled={!isReadyForConfirmation || submitting}
          onClick={handleConfirmAndSubmit}
          className={`w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 ${
            !isReadyForConfirmation || submitting
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              : 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 cursor-pointer active:scale-[0.99]'
          }`}
        >
          {submitting ? (
            <>
              <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
              <span>Submitting Confirmed Draft (v{draftVersion})...</span>
            </>
          ) : (
            <span>Confirm & Submit (Draft v{draftVersion})</span>
          )}
        </button>
        <p className="text-[10px] text-center text-slate-400 mt-1.5">
          Guarded Authority: Server re-verifies financial quote and de-duplication upon confirmation.
        </p>
      </div>
    </div>
  );
};

import React, { useState } from 'react';

export interface Step1FormData {
  fullName: string;
  mobileNumber: string;
  grossWeightGrams: string;
  netWeightGrams: string;
  karat: number;
}

interface Step1DetailsProps {
  initialData: Step1FormData;
  onNext: (data: Step1FormData) => void;
  apiErrors?: Record<string, string>;
}

export const Step1Details: React.FC<Step1DetailsProps> = ({ initialData, onNext, apiErrors = {} }) => {
  const [formData, setFormData] = useState<Step1FormData>(initialData);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Real-time validation computation
  const errors: Record<string, string> = {};

  // Full Name validation
  const nameTrimmed = formData.fullName.trim();
  if (!nameTrimmed) {
    errors.fullName = 'Full name is required';
  } else if (nameTrimmed.length < 2) {
    errors.fullName = 'Full name must be at least 2 characters';
  } else if (nameTrimmed.length > 60) {
    errors.fullName = 'Full name cannot exceed 60 characters';
  } else if (/[\t\n\r]/.test(formData.fullName)) {
    errors.fullName = 'Full name cannot contain tabs or newlines';
  } else if (!/^[a-zA-Z ]{2,60}$/.test(nameTrimmed)) {
    errors.fullName = 'Full name must contain only English letters and spaces';
  }

  // Mobile Number validation
  const mobileClean = formData.mobileNumber.replace(/\D/g, '');
  if (!mobileClean) {
    errors.mobileNumber = 'Mobile number is required';
  } else if (!/^[6-9]\d{9}$/.test(mobileClean)) {
    errors.mobileNumber = 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9';
  }

  // Gross Weight validation
  const grossNum = parseFloat(formData.grossWeightGrams);
  if (!formData.grossWeightGrams) {
    errors.grossWeightGrams = 'Gross weight is required';
  } else if (isNaN(grossNum) || grossNum <= 0) {
    errors.grossWeightGrams = 'Gross weight must be greater than 0 grams';
  } else if (grossNum > 1000) {
    errors.grossWeightGrams = 'Gross weight cannot exceed 1000 grams';
  } else if (!/^\d+(\.\d{1,2})?$/.test(formData.grossWeightGrams)) {
    errors.grossWeightGrams = 'Max 2 decimal places allowed';
  }

  // Net Weight validation
  const netNum = parseFloat(formData.netWeightGrams);
  if (!formData.netWeightGrams) {
    errors.netWeightGrams = 'Net weight is required';
  } else if (isNaN(netNum) || netNum <= 0) {
    errors.netWeightGrams = 'Net weight must be greater than 0 grams';
  } else if (netNum > 1000) {
    errors.netWeightGrams = 'Net weight cannot exceed 1000 grams';
  } else if (!/^\d+(\.\d{1,2})?$/.test(formData.netWeightGrams)) {
    errors.netWeightGrams = 'Max 2 decimal places allowed';
  } else if (!isNaN(grossNum) && netNum > grossNum) {
    errors.netWeightGrams = 'Net weight cannot exceed gross weight';
  }

  // Karat validation
  if (![18, 22, 24].includes(formData.karat)) {
    errors.karat = 'Select a valid karat purity (18K, 22K, or 24K)';
  }

  const getFieldError = (field: string): string | undefined => {
    if (touched[field]) {
      return errors[field] || apiErrors[field];
    }
    return apiErrors[field];
  };

  const isValid = Object.keys(errors).length === 0;

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({
      fullName: true,
      mobileNumber: true,
      grossWeightGrams: true,
      netWeightGrams: true,
      karat: true,
    });

    if (isValid) {
      onNext(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7 max-w-xl mx-auto space-y-5" noValidate>
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Step 1: Borrower & Gold Details</h2>
        <p className="text-sm text-slate-500 mt-1">
          Provide your identification and ornament weights for accurate real-time quotation.
        </p>
      </div>

      {/* Full Name */}
      <div>
        <label htmlFor="fullName" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
          Applicant Full Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="fullName"
          name="fullName"
          value={formData.fullName}
          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
          onBlur={() => handleBlur('fullName')}
          placeholder="e.g. Priya Sharma"
          maxLength={60}
          className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-slate-900 placeholder-slate-400 focus:outline-none transition-colors ${
            getFieldError('fullName')
              ? 'border-red-500 bg-red-50/30 focus:border-red-500 focus:ring-2 focus:ring-red-200'
              : 'border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200'
          }`}
        />
        {getFieldError('fullName') && (
          <p className="text-xs text-red-600 mt-1 font-medium" role="alert">
            {getFieldError('fullName')}
          </p>
        )}
      </div>

      {/* Mobile Number */}
      <div>
        <label htmlFor="mobileNumber" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
          10-Digit Mobile Number <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400 select-none">
            +91
          </span>
          <input
            type="tel"
            id="mobileNumber"
            name="mobileNumber"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={10}
            value={formData.mobileNumber}
            onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
            onBlur={() => handleBlur('mobileNumber')}
            placeholder="9876543210"
            className={`w-full pl-12 pr-3.5 py-2.5 rounded-lg border text-sm text-slate-900 placeholder-slate-400 focus:outline-none transition-colors ${
              getFieldError('mobileNumber')
                ? 'border-red-500 bg-red-50/30 focus:border-red-500 focus:ring-2 focus:ring-red-200'
                : 'border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200'
            }`}
          />
        </div>
        {getFieldError('mobileNumber') && (
          <p className="text-xs text-red-600 mt-1 font-medium" role="alert">
            {getFieldError('mobileNumber')}
          </p>
        )}
      </div>

      {/* Weights Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Gross Weight */}
        <div>
          <label htmlFor="grossWeightGrams" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Gross Weight (g) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              id="grossWeightGrams"
              name="grossWeightGrams"
              inputMode="decimal"
              value={formData.grossWeightGrams}
              onChange={(e) => setFormData({ ...formData, grossWeightGrams: e.target.value })}
              onBlur={() => handleBlur('grossWeightGrams')}
              placeholder="e.g. 50.00"
              className={`w-full px-3.5 py-2.5 pr-8 rounded-lg border text-sm text-slate-900 placeholder-slate-400 focus:outline-none transition-colors ${
                getFieldError('grossWeightGrams')
                  ? 'border-red-500 bg-red-50/30 focus:border-red-500 focus:ring-2 focus:ring-red-200'
                  : 'border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200'
              }`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 select-none">
              g
            </span>
          </div>
          {getFieldError('grossWeightGrams') && (
            <p className="text-xs text-red-600 mt-1 font-medium" role="alert">
              {getFieldError('grossWeightGrams')}
            </p>
          )}
        </div>

        {/* Net Weight */}
        <div>
          <label htmlFor="netWeightGrams" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Net Gold Weight (g) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              id="netWeightGrams"
              name="netWeightGrams"
              inputMode="decimal"
              value={formData.netWeightGrams}
              onChange={(e) => setFormData({ ...formData, netWeightGrams: e.target.value })}
              onBlur={() => handleBlur('netWeightGrams')}
              placeholder="e.g. 45.00"
              className={`w-full px-3.5 py-2.5 pr-8 rounded-lg border text-sm text-slate-900 placeholder-slate-400 focus:outline-none transition-colors ${
                getFieldError('netWeightGrams')
                  ? 'border-red-500 bg-red-50/30 focus:border-red-500 focus:ring-2 focus:ring-red-200'
                  : 'border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200'
              }`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 select-none">
              g
            </span>
          </div>
          {getFieldError('netWeightGrams') && (
            <p className="text-xs text-red-600 mt-1 font-medium" role="alert">
              {getFieldError('netWeightGrams')}
            </p>
          )}
        </div>
      </div>

      {/* Karat Selection */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
          Gold Purity (Karat) <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Karat Purity">
          {[18, 22, 24].map((k) => {
            const isSelected = formData.karat === k;
            return (
              <button
                key={k}
                type="button"
                id={`karat-${k}-btn`}
                onClick={() => setFormData({ ...formData, karat: k })}
                className={`py-3 px-3 rounded-xl border text-center font-bold text-sm transition-all ${
                  isSelected
                    ? 'bg-amber-500 border-amber-600 text-slate-950 shadow-md ring-2 ring-amber-400/50'
                    : 'bg-white border-slate-300 text-slate-700 hover:border-amber-400 hover:bg-amber-50/40'
                }`}
                role="radio"
                aria-checked={isSelected}
              >
                <div>{k} Karat</div>
                <div className="text-[11px] font-normal opacity-80">
                  {k === 24 ? '99.9% Pure' : k === 22 ? '91.6% Pure' : '75.0% Pure'}
                </div>
              </button>
            );
          })}
        </div>
        {getFieldError('karat') && (
          <p className="text-xs text-red-600 mt-1 font-medium" role="alert">
            {getFieldError('karat')}
          </p>
        )}
      </div>

      {/* Next Step Button */}
      <div className="pt-2">
        <button
          type="submit"
          id="proceed-to-quote-btn"
          className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 shadow-md shadow-amber-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Calculate Live Quote</span>
          <span>→</span>
        </button>
      </div>
    </form>
  );
};

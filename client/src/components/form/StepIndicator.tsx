import React from 'react';

interface StepIndicatorProps {
  currentStep: 1 | 2 | 3;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const steps = [
    { number: 1, title: 'Details', desc: 'Weights & Purity' },
    { number: 2, title: 'Live Quote', desc: 'Scheme Selection' },
    { number: 3, title: 'Confirm', desc: 'Review & Submit' },
  ];

  return (
    <div className="w-full max-w-xl mx-auto px-2 py-4">
      <div className="flex items-center justify-between relative">
        <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 -z-0">
          <div
            className="h-full bg-amber-500 transition-all duration-300"
            style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
          />
        </div>

        {steps.map((step) => {
          const isCompleted = currentStep > step.number;
          const isCurrent = currentStep === step.number;

          return (
            <div key={step.number} className="flex flex-col items-center z-10">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-200 border-2 ${
                  isCompleted
                    ? 'bg-amber-500 border-amber-500 text-slate-950'
                    : isCurrent
                    ? 'bg-slate-950 border-amber-500 text-amber-400 shadow-md ring-4 ring-amber-500/20'
                    : 'bg-white border-slate-300 text-slate-400'
                }`}
              >
                {isCompleted ? '✓' : step.number}
              </div>
              <span
                className={`text-xs mt-1.5 font-semibold ${
                  isCurrent ? 'text-amber-700' : isCompleted ? 'text-slate-800' : 'text-slate-400'
                }`}
              >
                {step.title}
              </span>
              <span className="hidden sm:block text-[10px] text-slate-500">{step.desc}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

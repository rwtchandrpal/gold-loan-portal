import React, { useState, useEffect } from 'react';
import { Header } from './components/layout/Header.js';
import { StepIndicator } from './components/form/StepIndicator.js';
import { Step1Details, type Step1FormData } from './components/form/Step1Details.js';
import { Step2LiveQuote } from './components/form/Step2LiveQuote.js';
import { Step3Confirm } from './components/form/Step3Confirm.js';
import { AdminLeadsView } from './components/admin/AdminLeadsView.js';
import { AgentChatPanel } from './components/chat/AgentChatPanel.js';
import { api } from './api/client.js';
import type { LoanScheme, QuoteResponse } from './types/api.js';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'apply' | 'chat' | 'admin'>('apply');
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Form State across steps
  const [formData, setFormData] = useState<Step1FormData>({
    fullName: '',
    mobileNumber: '',
    grossWeightGrams: '',
    netWeightGrams: '',
    karat: 22,
  });

  const [schemes, setSchemes] = useState<LoanScheme[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [quotes, setQuotes] = useState<Record<string, QuoteResponse>>({});

  // Pre-load loan schemes
  useEffect(() => {
    async function loadSchemes() {
      try {
        const data = await api.getLoanSchemes();
        setSchemes(data);
        if (data.length > 0 && !selectedPlanId) {
          setSelectedPlanId(data[0].id);
        }
      } catch {
        // Handled within Step 2
      }
    }
    loadSchemes();
  }, []);

  const handleStep1Next = (data: Step1FormData) => {
    setFormData(data);
    setCurrentStep(2);
  };

  const handleStep2Next = (planId: string, quotesMap: Record<string, QuoteResponse>) => {
    setSelectedPlanId(planId);
    setQuotes(quotesMap);
    setCurrentStep(3);
  };

  const handleUpdateWeights = (gross: string, net: string, karat: number) => {
    setFormData((prev) => ({
      ...prev,
      grossWeightGrams: gross,
      netWeightGrams: net,
      karat,
    }));
  };

  const handleReset = () => {
    setFormData({
      fullName: '',
      mobileNumber: '',
      grossWeightGrams: '',
      netWeightGrams: '',
      karat: 22,
    });
    setSelectedPlanId(schemes[0]?.id || '');
    setQuotes({});
    setCurrentStep(1);
  };

  const selectedScheme = schemes.find((s) => s.id === selectedPlanId);
  const selectedQuote = quotes[selectedPlanId];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans antialiased text-slate-900 selection:bg-amber-400 selection:text-slate-950">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 sm:px-6">
        {activeTab === 'apply' ? (
          <div className="space-y-4">
            <StepIndicator currentStep={currentStep} />

            {currentStep === 1 && (
              <Step1Details
                initialData={formData}
                onNext={handleStep1Next}
              />
            )}

            {currentStep === 2 && (
              <Step2LiveQuote
                applicantData={formData}
                selectedPlanId={selectedPlanId}
                onSelectPlan={setSelectedPlanId}
                onUpdateWeights={handleUpdateWeights}
                onNext={handleStep2Next}
                onBack={() => setCurrentStep(1)}
              />
            )}

            {currentStep === 3 && (
              <Step3Confirm
                applicantData={formData}
                selectedScheme={selectedScheme}
                quote={selectedQuote}
                onBack={() => setCurrentStep(2)}
                onReset={handleReset}
              />
            )}
          </div>
        ) : activeTab === 'chat' ? (
          <AgentChatPanel />
        ) : (
          <AdminLeadsView />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Gold Loan Portal • Authoritative Server Valuation Architecture</span>
          <span className="font-medium text-slate-600">Regulatory Ceiling: RBI 75% Max LTV</span>
        </div>
      </footer>
    </div>
  );
};

export default App;

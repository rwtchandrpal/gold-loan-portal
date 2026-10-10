import React from 'react';

interface HeaderProps {
  activeTab: 'apply' | 'chat' | 'admin';
  onTabChange: (tab: 'apply' | 'chat' | 'admin') => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange }) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-5xl mx-auto px-4 py-3 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Logo and Brand */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 flex items-center justify-center font-bold text-slate-950 text-xl shadow-lg shadow-amber-500/20">
              GL
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-tight">
                Gold Loan Portal
              </h1>
              <p className="text-xs text-amber-400 font-medium">
                Instant Valuation & Verified Loans
              </p>
            </div>
          </div>

          <div className="sm:hidden inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-600/50 text-amber-300">
            <span>24K: ₹7,000/g</span>
          </div>
        </div>

        {/* Navigation Tabs and Market Rate Badge */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/80 border border-amber-600/50 text-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            <span>Benchmark 24K: ₹7,000 / g</span>
          </div>

          <nav className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700 w-full sm:w-auto justify-center gap-1" aria-label="Portal Navigation">
            <button
              type="button"
              id="tab-apply-btn"
              onClick={() => onTabChange('apply')}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'apply'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Apply (Form)
            </button>
            <button
              type="button"
              id="tab-chat-btn"
              onClick={() => onTabChange('chat')}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center justify-center gap-1 ${
                activeTab === 'chat'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>AI Assistant</span>
              <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1 rounded font-bold">✨</span>
            </button>
            <button
              type="button"
              id="tab-admin-btn"
              onClick={() => onTabChange('admin')}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'admin'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Admin Leads
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};

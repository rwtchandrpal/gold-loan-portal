import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client.js';
import { MessageBubble } from './MessageBubble.js';
import { ConfirmationCard } from './ConfirmationCard.js';
import type { ChatMessage, ApplicationDraft } from '../../types/api.js';

export const AgentChatPanel: React.FC = () => {
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      content:
        'Hello! I am your AI Gold Loan Assistant. You can ask me questions about our loan plans, share your gold weights and karat to receive real-time quotes, and apply conversationally.\n\nHow can I help you today?',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [inputText, setInputText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Authoritative pending application state from server
  const [draft, setDraft] = useState<ApplicationDraft | null>(null);
  const [draftVersion, setDraftVersion] = useState<number>(1);
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, draft, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || loading) {
      return;
    }

    const userMessageId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);
    setError(null);

    try {
      const response = await api.agentChat({
        sessionId: sessionId || undefined,
        message: text,
      });

      // Update session ID if first turn
      if (!sessionId && response.sessionId) {
        setSessionId(response.sessionId);
      }

      // Update authoritative draft state directly from server response
      if (response.draft) {
        setDraft(response.draft);
      }
      if (response.draftVersion !== undefined) {
        setDraftVersion(response.draftVersion);
      }
      if (response.isConfirmed !== undefined) {
        setIsConfirmed(response.isConfirmed);
      }

      // Append assistant reply with tool executions
      const modelMsg: ChatMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        content: response.reply,
        timestamp: new Date().toISOString(),
        toolCallsExecuted: response.toolCallsExecuted,
      };

      setMessages((prev) => [...prev, modelMsg]);
    } catch (err: any) {
      setError(err.message || 'Failed to reach AI Loan Assist Agent.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSuccess = (applicationId: string) => {
    // Add confirmation notice to conversation
    setMessages((prev) => [
      ...prev,
      {
        id: `confirm-success-${Date.now()}`,
        role: 'system',
        content: `Application confirmed and submitted! Official Application ID: ${applicationId}`,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const handleResetChat = () => {
    setSessionId('');
    setDraft(null);
    setDraftVersion(1);
    setIsConfirmed(false);
    setError(null);
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'model',
        content:
          'Hello! I am your AI Gold Loan Assistant. How can I assist you with your gold loan inquiry today?',
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const quickPrompts = [
    'What gold loan schemes do you offer?',
    'Calculate quote: 45g net, 50g gross, 22K',
    'I want to apply for a loan: Name Priya Sharma, mobile 9876543210, 45g net, 50g gross, 22K, PLAN_EMI_01',
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 max-w-2xl mx-auto flex flex-col h-[750px] overflow-hidden">
      {/* Chat Header */}
      <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 text-white flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 font-black flex items-center justify-center text-sm shadow-sm">
            AI
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              <span>Loan Assist Agent</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </h2>
            <p className="text-[11px] text-amber-400 font-medium">
              Conversational Quoting & Guarded Submission
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sessionId && (
            <span className="hidden sm:inline-block font-mono text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              ID: {sessionId.slice(0, 8)}
            </span>
          )}
          <button
            type="button"
            onClick={handleResetChat}
            id="reset-chat-btn"
            title="Start New Session"
            className="text-xs px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
          >
            ↻ New Chat
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-slate-50/50">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Server-Authoritative Confirmation Card */}
        {draft && (
          <ConfirmationCard
            sessionId={sessionId}
            draft={draft}
            draftVersion={draftVersion}
            isConfirmed={isConfirmed}
            onConfirmSuccess={handleConfirmSuccess}
          />
        )}

        {/* Typing indicator */}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400 italic my-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce"></span>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce [animation-delay:0.2s]"></span>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-bounce [animation-delay:0.4s]"></span>
            <span>AI Assistant is analyzing and executing tools...</span>
          </div>
        )}

        {error && (
          <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Bar (when only initial message) */}
      {messages.length <= 1 && (
        <div className="p-3 bg-white border-t border-slate-100 flex flex-wrap gap-1.5">
          {quickPrompts.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(prompt)}
              className="text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-amber-100/70 hover:text-amber-900 px-2.5 py-1 rounded-full border border-slate-200 transition-colors text-left cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input Bar */}
      <div className="p-3 sm:p-4 bg-white border-t border-slate-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            id="agent-chat-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={loading}
            placeholder="Ask a question or provide your loan details..."
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:bg-slate-100 transition-all"
          />
          <button
            type="submit"
            id="agent-chat-send-btn"
            disabled={!inputText.trim() || loading}
            className={`py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs ${
              !inputText.trim() || loading
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-600 text-slate-950 cursor-pointer active:scale-95'
            }`}
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </form>
        <p className="text-[10px] text-center text-slate-400 mt-1.5">
          Ask questions naturally • Details are parsed and calculated authoritative on server
        </p>
      </div>
    </div>
  );
};

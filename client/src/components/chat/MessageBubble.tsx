import React, { useState } from 'react';
import type { ChatMessage, AgentToolCallItem } from '../../types/api.js';
import { MarkdownContent } from './MarkdownContent.js';

interface MessageBubbleProps {
  message: ChatMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const [expandedTools, setExpandedTools] = useState<boolean>(false);

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <span>✓</span>
          <span>{message.content}</span>
        </div>
      </div>
    );
  }

  const formatToolName = (tool: AgentToolCallItem) => {
    if (tool.name === 'calculate_quote') {
      return `Quote Engine (${tool.args?.net}g net, ${tool.args?.karat}K)`;
    }
    if (tool.name === 'get_loan_schemes') {
      return 'Loan Schemes Catalog';
    }
    if (tool.name === 'submit_application') {
      return `Submission Guard (${tool.args?.selectedPlanId})`;
    }
    return tool.name;
  };

  return (
    <div className={`flex flex-col my-3 ${isUser ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-1.5 mb-1 px-1">
        <span className="text-[11px] font-bold text-slate-500">
          {isUser ? 'You' : 'AI Loan Assist'}
        </span>
        <span className="text-[10px] text-slate-400">
          {new Date(message.timestamp).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-2xs ${
          isUser
            ? 'bg-slate-900 text-white rounded-br-xs'
            : 'bg-white text-slate-800 border border-slate-200/90 rounded-bl-xs'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <MarkdownContent content={message.content} />
        )}

        {/* Tool execution badges */}
        {message.toolCallsExecuted && message.toolCallsExecuted.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setExpandedTools(!expandedTools)}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100/70 border border-amber-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              <span>
                {message.toolCallsExecuted.length} Server Tool{message.toolCallsExecuted.length > 1 ? 's' : ''} Executed
              </span>
              <span className="text-[9px]">{expandedTools ? '▲' : '▼'}</span>
            </button>

            {expandedTools && (
              <div className="mt-2 space-y-1.5 text-[11px]">
                {message.toolCallsExecuted.map((tool, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded bg-slate-50 border border-slate-200 font-mono text-[10px] text-slate-700"
                  >
                    <div className="font-bold text-amber-700">⚡ {formatToolName(tool)}</div>
                    {tool.result?.success !== undefined && (
                      <div className="text-slate-500 mt-0.5">
                        Status: {tool.result.success ? 'Success' : `Failed (${tool.result.error})`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from './MessageBubble.js';
import type { ChatMessage } from '../../types/api.js';

describe('MessageBubble & MarkdownContent Rendering', () => {
  it('renders bold markdown as bold elements without showing literal **', () => {
    const message: ChatMessage = {
      id: 'msg-1',
      role: 'model',
      content: 'We offer **Monthly EMI** and **Bullet Repayment** schemes.',
      timestamp: new Date().toISOString(),
    };

    const { container } = render(<MessageBubble message={message} />);

    // Literal ** should not be present in the document
    expect(container.textContent).not.toContain('**');
    expect(screen.getByText('Monthly EMI')).toBeInTheDocument();
    expect(screen.getByText('Bullet Repayment')).toBeInTheDocument();

    // Verify <strong> elements are rendered
    const boldElements = container.querySelectorAll('strong');
    expect(boldElements.length).toBe(2);
    expect(boldElements[0].textContent).toBe('Monthly EMI');
    expect(boldElements[1].textContent).toBe('Bullet Repayment');
  });

  it('renders inline code without showing literal backticks', () => {
    const message: ChatMessage = {
      id: 'msg-2',
      role: 'model',
      content: 'Selected scheme is `PLAN_EMI_01` with max LTV `75%`.',
      timestamp: new Date().toISOString(),
    };

    const { container } = render(<MessageBubble message={message} />);

    // Literal backticks should not be visible
    expect(container.textContent).not.toContain('`');
    expect(screen.getByText('PLAN_EMI_01')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();

    // Verify <code> elements are rendered
    const codeElements = container.querySelectorAll('code');
    expect(codeElements.length).toBe(2);
    expect(codeElements[0].textContent).toBe('PLAN_EMI_01');
    expect(codeElements[1].textContent).toBe('75%');
  });

  it('renders numbered and bulleted lists with correct semantic tags and indentation', () => {
    const message: ChatMessage = {
      id: 'msg-3',
      role: 'model',
      content: `1. **Monthly EMI** (\`PLAN_EMI_01\`)
   - **Interest Rate:** 10.5% p.a.
   - **Tenure:** 12 months
   - **Max Loan-to-Value (LTV):** 75%
2. **Bullet Repayment** (\`PLAN_BULLET_01\`)
   - **Interest Rate:** 12.0% p.a.`,
      timestamp: new Date().toISOString(),
    };

    const { container } = render(<MessageBubble message={message} />);

    // Delimiters should not be shown as raw text
    expect(container.textContent).not.toContain('**');
    expect(container.textContent).not.toContain('`');

    // Ordered list exists
    const ol = container.querySelector('ol');
    expect(ol).toBeInTheDocument();
    expect(ol?.children.length).toBe(2);

    // Nested unordered lists exist for sub-bullets
    const uls = container.querySelectorAll('ul');
    expect(uls.length).toBe(2);

    // List items check
    const lis = container.querySelectorAll('li');
    expect(lis.length).toBe(6); // 2 top-level + 4 sub-items
  });

  it('preserves multiline paragraphs and line breaks', () => {
    const message: ChatMessage = {
      id: 'msg-4',
      role: 'model',
      content: 'First paragraph about gold loans.\n\nSecond paragraph with more details.\nLine two of second paragraph.',
      timestamp: new Date().toISOString(),
    };

    const { container } = render(<MessageBubble message={message} />);

    expect(screen.getByText('First paragraph about gold loans.')).toBeInTheDocument();
    expect(container.textContent).toContain('Second paragraph with more details.');
    expect(container.textContent).toContain('Line two of second paragraph.');
    expect(container.querySelector('br')).toBeInTheDocument();
  });

  it('renders plain text responses cleanly without errors', () => {
    const message: ChatMessage = {
      id: 'msg-5',
      role: 'model',
      content: 'How can I assist you with your gold loan application today?',
      timestamp: new Date().toISOString(),
    };

    render(<MessageBubble message={message} />);
    expect(
      screen.getByText('How can I assist you with your gold loan application today?')
    ).toBeInTheDocument();
  });

  it('preserves user message display and styling', () => {
    const userMessage: ChatMessage = {
      id: 'user-1',
      role: 'user',
      content: 'I want a loan for 50g gross, 45g net, 22K gold.',
      timestamp: new Date().toISOString(),
    };

    const { container } = render(<MessageBubble message={userMessage} />);

    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('I want a loan for 50g gross, 45g net, 22K gold.')).toBeInTheDocument();

    // User bubble has distinct dark background class
    const bubble = container.querySelector('.bg-slate-900');
    expect(bubble).toBeInTheDocument();
  });

  it('safely escapes unexpected or malicious HTML content without script execution', () => {
    const maliciousMessage: ChatMessage = {
      id: 'malicious-1',
      role: 'model',
      content: 'Here is your info: <script>window.__hacked = true;</script><div id="injected-el">Bad</div>',
      timestamp: new Date().toISOString(),
    };

    const { container } = render(<MessageBubble message={maliciousMessage} />);

    // Script tag must NOT be created in the DOM
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('#injected-el')).toBeNull();

    // Text content is escaped and displayed harmlessly as text
    expect(container.textContent).toContain('<script>window.__hacked = true;</script>');
    expect(container.textContent).toContain('<div id="injected-el">Bad</div>');
    expect((window as any).__hacked).toBeUndefined();
  });

  it('renders cleanly in a 375px mobile viewport constraint without horizontal overflow classes', () => {
    const message: ChatMessage = {
      id: 'mobile-msg',
      role: 'model',
      content: `1. **Monthly EMI Scheme** (\`PLAN_EMI_01\`)
   - **Interest Rate:** 10.5% p.a.
   - **Tenure:** 12 months`,
      timestamp: new Date().toISOString(),
    };

    const { container } = render(
      <div style={{ width: '375px' }}>
        <MessageBubble message={message} />
      </div>
    );

    const bubble = container.querySelector('.break-words');
    expect(bubble).toBeInTheDocument();
    expect(container.textContent).toContain('Monthly EMI Scheme');
  });
});

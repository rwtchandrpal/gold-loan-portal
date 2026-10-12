import React from 'react';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

interface ParsedListItem {
  type: 'ordered' | 'bullet';
  indent: number;
  text: string;
  subItems: ParsedListItem[];
}

type Block =
  | { type: 'header'; level: number; text: string }
  | { type: 'hr' }
  | { type: 'list'; items: ParsedListItem[] }
  | { type: 'paragraph'; lines: string[] };

/**
 * Safely parses inline markdown (bold **text**, inline code `code`) into React elements.
 * Never uses dangerouslySetInnerHTML, guaranteeing 100% protection against XSS.
 */
export function parseInline(text: string): React.ReactNode[] {
  if (!text) return [];

  const tokens: React.ReactNode[] = [];
  // Matches **bold** or `code`
  const regex = /(\*\*[^*]+?\*\*|`[^`]+?`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }

    const matchedStr = match[0];
    if (matchedStr.startsWith('**') && matchedStr.endsWith('**') && matchedStr.length >= 4) {
      const inner = matchedStr.slice(2, -2);
      tokens.push(
        <strong key={`bold-${match.index}`} className="font-semibold text-slate-900">
          {parseInline(inner)}
        </strong>
      );
    } else if (matchedStr.startsWith('`') && matchedStr.endsWith('`') && matchedStr.length >= 2) {
      const inner = matchedStr.slice(1, -1);
      tokens.push(
        <code
          key={`code-${match.index}`}
          className="px-1.5 py-0.5 mx-0.5 font-mono text-[11px] sm:text-xs bg-slate-100 text-slate-800 rounded border border-slate-200/80 break-all"
        >
          {inner}
        </code>
      );
    } else {
      tokens.push(matchedStr);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens;
}

/**
 * Parses raw markdown text into structured blocks (headers, rules, lists, paragraphs).
 */
export function parseBlocks(content: string): Block[] {
  const lines = content.split('\n');
  const blocks: Block[] = [];
  let currentParagraph: string[] = [];
  let currentListItems: ParsedListItem[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      blocks.push({ type: 'paragraph', lines: [...currentParagraph] });
      currentParagraph = [];
    }
  };

  const flushList = () => {
    if (currentListItems.length > 0) {
      blocks.push({ type: 'list', items: [...currentListItems] });
      currentListItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. Empty lines separate blocks
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    // 2. Horizontal rules
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushParagraph();
      flushList();
      blocks.push({ type: 'hr' });
      continue;
    }

    // 3. Headings (#, ##, ###, etc.)
    const headingMatch = rawLine.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: 'header',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    // 4. List items (ordered or bulleted)
    const orderedMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.+)$/);
    const bulletMatch = rawLine.match(/^(\s*)(?:[-*•])\s+(.+)$/);

    if (orderedMatch || bulletMatch) {
      flushParagraph();
      const indent = (orderedMatch ? orderedMatch[1] : bulletMatch![1]).length;
      const text = orderedMatch ? orderedMatch[3] : bulletMatch![2];
      const type = orderedMatch ? ('ordered' as const) : ('bullet' as const);

      const newItem: ParsedListItem = {
        type,
        indent,
        text,
        subItems: [],
      };

      // Indented item belongs to the previous top-level list item if one exists
      if (indent >= 2 && currentListItems.length > 0) {
        currentListItems[currentListItems.length - 1].subItems.push(newItem);
      } else {
        currentListItems.push(newItem);
      }
      continue;
    }

    // 5. Regular text line (paragraph)
    flushList();
    currentParagraph.push(rawLine);
  }

  flushParagraph();
  flushList();

  return blocks;
}

/**
 * Clean, safe Markdown renderer for chat messages.
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className = '' }) => {
  if (!content) return null;

  const blocks = parseBlocks(content);

  return (
    <div className={`space-y-2 text-xs sm:text-sm leading-relaxed break-words ${className}`}>
      {blocks.map((block, bIdx) => {
        if (block.type === 'hr') {
          return <hr key={`hr-${bIdx}`} className="my-2 border-slate-200" />;
        }

        if (block.type === 'header') {
          const sizeClass =
            block.level <= 2
              ? 'text-sm sm:text-base font-bold text-slate-900 mt-2 mb-1'
              : 'text-xs sm:text-sm font-bold text-slate-900 mt-2 mb-0.5';
          return (
            <div key={`head-${bIdx}`} className={sizeClass}>
              {parseInline(block.text)}
            </div>
          );
        }

        if (block.type === 'list') {
          const isOrdered = block.items[0]?.type === 'ordered';

          if (isOrdered) {
            return (
              <ol key={`list-${bIdx}`} className="list-decimal ml-5 space-y-1.5 my-1.5 text-slate-800">
                {block.items.map((item, iIdx) => (
                  <li key={`item-${iIdx}`} className="pl-0.5">
                    <div>{parseInline(item.text)}</div>
                    {item.subItems.length > 0 && (
                      <ul className="list-disc ml-5 mt-1 space-y-0.5 text-slate-700">
                        {item.subItems.map((sub, sIdx) => (
                          <li key={`sub-${sIdx}`} className="pl-0.5">
                            {parseInline(sub.text)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            );
          }

          return (
            <ul key={`list-${bIdx}`} className="list-disc ml-5 space-y-1 my-1.5 text-slate-800">
              {block.items.map((item, iIdx) => (
                <li key={`item-${iIdx}`} className="pl-0.5">
                  <div>{parseInline(item.text)}</div>
                  {item.subItems.length > 0 && (
                    <ul className="list-disc ml-5 mt-0.5 space-y-0.5 text-slate-700">
                      {item.subItems.map((sub, sIdx) => (
                        <li key={`sub-${sIdx}`} className="pl-0.5">
                          {parseInline(sub.text)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          );
        }

        // Paragraph
        return (
          <div key={`p-${bIdx}`} className="text-slate-800 leading-relaxed">
            {block.lines.map((line, lIdx) => (
              <React.Fragment key={`line-${lIdx}`}>
                {lIdx > 0 && <br />}
                {parseInline(line)}
              </React.Fragment>
            ))}
          </div>
        );
      })}
    </div>
  );
};

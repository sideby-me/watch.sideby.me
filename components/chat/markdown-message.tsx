'use client';

import React, { memo } from 'react';
import {
  parseChatMarkdown,
  CHAT_MARKDOWN_PATTERN,
  AUTO_LINK_REGEX,
  trimAutolink,
  type Node,
} from '@/lib/chat-markdown';
import { CHAT_TIMESTAMP_PATTERN, findNextTimestamp } from '@/lib/chat-timestamps';

export interface MarkdownMessageProps {
  content: string;
  className?: string;
  onTimestampClick?: (seconds: number) => void;
  isOwnMessage?: boolean;
}

export const MarkdownMessage = memo(function MarkdownMessage({
  content,
  className,
  onTimestampClick,
  isOwnMessage,
}: MarkdownMessageProps) {
  const shouldParse = CHAT_MARKDOWN_PATTERN.test(content) || CHAT_TIMESTAMP_PATTERN.test(content);
  if (!shouldParse) return <span className={className}>{content}</span>;
  const ast = parseChatMarkdown(content);
  return <span className={className}>{renderAst(ast, { onTimestampClick, isOwnMessage })}</span>;
});

type RenderOptions = {
  onTimestampClick?: (seconds: number) => void;
  disableTimestamps?: boolean;
  isOwnMessage?: boolean;
};

// Render AST to React
function renderAst(nodes: Node[], options: RenderOptions, keyPrefix = ''): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  nodes.forEach((n, idx) => {
    const key = keyPrefix + idx;
    switch (n.type) {
      case 'text':
        out.push(...renderTextWithEntities(n.value, key, options));
        break;
      case 'code':
        out.push(
          <code key={key} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.7rem] dark:bg-white/10">
            {n.value}
          </code>
        );
        break;
      case 'italic':
        out.push(<em key={key}>{renderAst(n.children, options, key + '-')}</em>);
        break;
      case 'bold':
        out.push(
          <strong key={key} className="font-semibold">
            {renderAst(n.children, options, key + '-')}
          </strong>
        );
        break;
      case 'bolditalic':
        out.push(
          <strong key={key} className="font-semibold">
            <em>{renderAst(n.children, options, key + '-')}</em>
          </strong>
        );
        break;
      case 'underline':
        out.push(
          <span key={key} className="decoration-underline underline underline-offset-2">
            {renderAst(n.children, options, key + '-')}
          </span>
        );
        break;
      case 'strike':
        out.push(
          <del key={key} className="opacity-80">
            {renderAst(n.children, options, key + '-')}
          </del>
        );
        break;
      case 'link':
        out.push(
          <a
            key={key}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-primary-foreground/80"
          >
            {renderAst(n.children, { ...options, disableTimestamps: true }, key + '-')}
          </a>
        );
        break;
    }
  });
  return out;
}

function renderTextWithEntities(text: string, key: string, options: RenderOptions): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  type Entity =
    | { type: 'link'; start: number; end: number; href: string; display: string; raw: string }
    | { type: 'timestamp'; start: number; end: number; raw: string; seconds: number; display: string };

  const findNextLink = (from: number) => {
    AUTO_LINK_REGEX.lastIndex = from;
    const match = AUTO_LINK_REGEX.exec(text);
    if (!match) return null;
    const raw = match[0];
    const { href, display } = trimAutolink(raw);
    return {
      type: 'link' as const,
      start: match.index,
      end: match.index + raw.length,
      href,
      display,
      raw,
    } satisfies Entity;
  };

  const nextEntity = (from: number): Entity | null => {
    const link = findNextLink(from);
    const tsMatch = options.disableTimestamps ? null : findNextTimestamp(text, from);
    const timestamp = tsMatch
      ? ({
          type: 'timestamp' as const,
          start: tsMatch.start,
          end: tsMatch.end,
          raw: tsMatch.raw,
          seconds: tsMatch.parsed.seconds,
          display: tsMatch.parsed.display,
        } satisfies Entity)
      : null;

    const candidates = [link, timestamp].filter(Boolean) as Entity[];
    if (!candidates.length) return null;

    // Prefer links when entities start at the same position to avoid nesting
    return candidates.sort((a, b) => (a.start === b.start ? (a.type === 'link' ? -1 : 1) : a.start - b.start))[0];
  };

  while (cursor < text.length) {
    const entity = nextEntity(cursor);
    if (!entity) {
      nodes.push(<React.Fragment key={key + '-t-' + cursor}>{text.slice(cursor)}</React.Fragment>);
      break;
    }

    if (entity.start > cursor) {
      nodes.push(<React.Fragment key={key + '-t-' + cursor}>{text.slice(cursor, entity.start)}</React.Fragment>);
    }

    if (entity.type === 'link') {
      nodes.push(
        <a
          key={key + '-l-' + entity.start}
          href={entity.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-primary-foreground/80"
        >
          {entity.display}
        </a>
      );
    } else {
      nodes.push(
        <button
          key={key + '-ts-' + entity.start}
          type="button"
          className={`inline-flex items-center rounded px-1 underline decoration-dotted underline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 ${
            options.isOwnMessage
              ? 'text-primary-foreground hover:bg-primary-500 focus-visible:outline-primary-foreground'
              : 'text-destructive hover:bg-destructive-100 focus-visible:outline-destructive-foreground'
          }`}
          onClick={
            options.onTimestampClick
              ? e => {
                  e.stopPropagation();
                  options.onTimestampClick?.(entity.seconds);
                }
              : undefined
          }
          title={`Jump to ${entity.display}`}
        >
          {entity.display}
        </button>
      );
    }

    cursor = entity.end;
  }

  return nodes;
}

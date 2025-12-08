'use client';

import React, { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ChatMessage } from '@/types';
import { MarkdownMessage } from './markdown-message';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { EmojiPicker, EmojiPickerSearch, EmojiPickerContent, EmojiPickerFooter } from '@/components/ui/emoji-picker';
import { SmilePlus, Reply } from 'lucide-react';
import { useFullscreenPortalContainer } from '@/hooks/use-fullscreen-portal-container';

interface ChatMessageItemProps {
  message: ChatMessage;
  currentUserId: string;
  mode?: 'sidebar' | 'overlay';
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onReply?: (messageId: string, userName: string, message: string) => void;
  onQuoteClick?: (messageId: string) => void;
  users?: { id: string; name: string }[];
  onTimestampClick?: (seconds: number) => void;
}

export function ChatMessageItem({
  message,
  currentUserId,
  mode = 'sidebar',
  onToggleReaction,
  onReply,
  onQuoteClick,
  users = [],
  onTimestampClick,
}: ChatMessageItemProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const portalContainer = useFullscreenPortalContainer();

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const formatMessageTime = (timestamp: Date) =>
    new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(timestamp));

  const truncateMessage = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  const isOwnMessage = message.userId === currentUserId;
  const avatarSize = mode === 'overlay' ? 'h-6 w-6' : 'h-8 w-8';
  const textSize = mode === 'overlay' ? 'text-sm' : 'text-sm';
  const userHasReacted = (emoji: string) => message.reactions?.[emoji]?.includes(currentUserId);

  return (
    <div className={`flex min-w-0 flex-col space-y-1 ${isOwnMessage ? 'items-end' : ''}`}>
      <div className={`flex w-full space-x-3 ${isOwnMessage ? 'flex-row-reverse space-x-reverse' : ''}`}>
        {/* Avatar */}
        {!isOwnMessage && (
          <Avatar className={`${avatarSize} flex-shrink-0`}>
            <AvatarFallback className="font-mono text-primary-800">{getInitials(message.userName)}</AvatarFallback>
          </Avatar>
        )}
        {/* Message Info */}
        <div className={`min-w-0 flex-1 space-y-1 ${isOwnMessage ? 'text-right' : ''}`}>
          <div className={`flex items-center ${isOwnMessage && 'flex-row-reverse gap-2'} space-x-2`}>
            <span className={`${textSize} font-bold tracking-tight`}>{!isOwnMessage ? message.userName : 'you!'}</span>
            <span className="font-mono text-xs tracking-tighter text-neutral">
              {formatMessageTime(message.timestamp)}
            </span>
          </div>

          {/* Reply quote */}
          {message.replyTo && (
            <div
              className={`mb-2 cursor-pointer rounded-md border-l-2 border-muted-foreground bg-muted p-2 text-xs ${isOwnMessage ? 'text-right' : ''}`}
              onClick={() => onQuoteClick?.(message.replyTo!.messageId)}
              title="Click to jump to original message"
            >
              <div className={`flex items-center gap-1 ${isOwnMessage ? 'justify-end' : ''}`}>
                <Reply className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium text-muted-foreground">{message.replyTo.userName}</span>
              </div>
              <div className="mt-1 text-muted-foreground">
                <MessageWithMentions
                  content={truncateMessage(message.replyTo.message)}
                  currentUserId={currentUserId}
                  users={users}
                  onTimestampClick={onTimestampClick}
                />
              </div>
            </div>
          )}

          <div
            className={`group relative inline-block max-w-full break-words rounded-md px-3 py-2 tracking-tight text-primary-foreground ${textSize} ${
              isOwnMessage ? 'bg-primary' : 'bg-muted'
            }`}
            style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
          >
            {/* Message content */}
            <MessageWithMentions
              content={message.message}
              currentUserId={currentUserId}
              users={users}
              onTimestampClick={onTimestampClick}
              isOwnMessage={isOwnMessage}
            />

            {/* Action buttons (Reply & Reaction picker) */}
            <div className={`absolute -top-3 ${isOwnMessage ? 'right-2' : 'left-2'} flex gap-1`}>
              {/* Reply button */}
              {onReply && (
                <button
                  type="button"
                  aria-label="Reply to message"
                  title="Reply to message"
                  className="pointer-events-none z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background/80 text-[11px] text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-foreground group-hover:pointer-events-auto group-hover:opacity-100"
                  onClick={() => onReply(message.id, message.userName, message.message)}
                  onMouseDown={e => e.preventDefault()}
                >
                  <Reply className="h-3 w-3" />
                </button>
              )}

              {/* Reaction picker */}
              {onToggleReaction && (
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Add reaction"
                      title="Add reaction"
                      className="pointer-events-none z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background/80 text-[11px] text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-foreground group-hover:pointer-events-auto group-hover:opacity-100"
                      onMouseDown={e => e.preventDefault()}
                    >
                      <SmilePlus className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align={isOwnMessage ? 'end' : 'start'}
                    side="top"
                    className="w-full max-w-[280px] p-0"
                    sideOffset={6}
                    container={portalContainer}
                  >
                    <div
                      className="h-[320px] w-full"
                      onClick={e => {
                        const target = e.target as HTMLElement;
                        if (target?.dataset?.slot === 'emoji-picker-emoji') {
                          const emojiChar = target.textContent?.trim();
                          if (emojiChar) {
                            onToggleReaction(message.id, emojiChar);
                            setPickerOpen(false); // close after selection
                          }
                        }
                      }}
                    >
                      <EmojiPicker className="h-full">
                        <EmojiPickerSearch placeholder="Search" autoFocus />
                        <EmojiPickerContent />
                        <EmojiPickerFooter />
                      </EmojiPicker>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Reactions */}
      {message.reactions && Object.keys(message.reactions).length > 0 && (
        <div className={`flex flex-wrap gap-1 ${isOwnMessage ? 'justify-end' : 'justify-start'} pl-10 pr-2`}>
          {Object.entries(message.reactions)
            .sort((a, b) => b[1].length - a[1].length)
            .map(([emoji, users]) => {
              const reacted = userHasReacted(emoji);
              return (
                <button
                  key={emoji}
                  onClick={() => onToggleReaction?.(message.id, emoji)}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-muted ${
                    reacted ? 'border-primary bg-primary/20' : 'border-muted'
                  }`}
                  aria-pressed={reacted}
                >
                  <span>{emoji}</span>
                  <span className="font-mono text-[10px]">{users.length}</span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}

// Mention highlights supports structured tokens (@[Name](uuid)) and plain @Name
const MessageWithMentions = ({
  content,
  currentUserId,
  users = [],
  onTimestampClick,
  isOwnMessage,
}: {
  content: string;
  currentUserId: string;
  users?: { id: string; name: string }[];
  onTimestampClick?: (seconds: number) => void;
  isOwnMessage?: boolean;
}) => {
  const STRUCTURED = /@\[([^\]]{1,30})\]\(([0-9a-fA-F\-]{36})\)/g;
  const hasStructured = STRUCTURED.test(content);
  STRUCTURED.lastIndex = 0;

  // Fast path: no '@' at all
  if (!content.includes('@'))
    return <MarkdownMessage content={content} onTimestampClick={onTimestampClick} isOwnMessage={isOwnMessage} />;

  if (hasStructured) {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = STRUCTURED.exec(content))) {
      const [full, name, id] = m;
      const start = m.index;
      if (start > lastIndex) {
        const slice = content.slice(lastIndex, start);
        parts.push(
          <MarkdownMessage
            key={start + '-pre'}
            content={slice}
            onTimestampClick={onTimestampClick}
            isOwnMessage={isOwnMessage}
          />
        );
      }
      const isYou = id === currentUserId;
      parts.push(
        <span
          key={start + '-mention'}
          className={`inline-block rounded bg-primary-50 px-1 py-0.5 font-medium text-primary-foreground shadow-sm ring-1 ${
            isYou ? 'outline-none ring-2 ring-offset-1 ring-offset-background' : ''
          }`}
          title={`Mention: ${name}${isYou ? ' (you)' : ''}`}
        >
          @{name}
        </span>
      );
      lastIndex = start + full.length;
    }
    if (lastIndex < content.length)
      parts.push(
        <MarkdownMessage
          key={'final'}
          content={content.slice(lastIndex)}
          onTimestampClick={onTimestampClick}
          isOwnMessage={isOwnMessage}
        />
      );
    return <>{parts}</>;
  }

  // Plain mention mode: try to match @Name where Name equals a user name (case-insensitive).
  if (!users.length)
    return <MarkdownMessage content={content} onTimestampClick={onTimestampClick} isOwnMessage={isOwnMessage} />;
  const nameMap = new Map(users.map(u => [u.name.toLowerCase(), u] as const));
  const parts: React.ReactNode[] = [];
  let i = 0;
  const len = content.length;
  while (i < len) {
    const ch = content[i];
    if (ch === '@') {
      // Only treat as mention if start or preceded by whitespace
      const prev = i === 0 ? ' ' : content[i - 1];
      if (!/\s/.test(prev)) {
        parts.push(<React.Fragment key={i}>{ch}</React.Fragment>);
        i += 1;
        continue;
      }
      // Try longest matching name
      let matched: { id: string; name: string } | null = null;
      let matchedLength = 0;
      for (const [lowerName, user] of nameMap.entries()) {
        const candidate = content.slice(i + 1, i + 1 + lowerName.length);
        if (candidate.toLowerCase() === lowerName) {
          // Boundary check (end or whitespace / punctuation)
          const boundaryChar = content[i + 1 + lowerName.length] || '';
          if (boundaryChar === '' || /[\s.,!?;:)/\]]/.test(boundaryChar)) {
            if (lowerName.length > matchedLength) {
              matched = user;
              matchedLength = lowerName.length;
            }
          }
        }
      }
      if (matched) {
        const isYou = matched.id === currentUserId;
        parts.push(
          <span
            key={i + '-mention-plain'}
            className={`inline-block rounded bg-primary/30 px-1 py-0.5 font-medium text-primary-foreground ring-1 ${
              isYou ? 'outline-none ring-2 ring-offset-1 ring-offset-background' : ''
            }`}
            title={`Mention: ${matched.name}${isYou ? ' (you)' : ''}`}
          >
            @{matched.name}
          </span>
        );
        i += 1 + matchedLength;
        continue;
      }
      parts.push(<React.Fragment key={i}>{ch}</React.Fragment>);
      i += 1;
    } else {
      const nextAt = content.indexOf('@', i + 1);
      const end = nextAt === -1 ? len : nextAt;
      const slice = content.slice(i, end);
      parts.push(
        <MarkdownMessage
          key={i + '-txt'}
          content={slice}
          onTimestampClick={onTimestampClick}
          isOwnMessage={isOwnMessage}
        />
      );
      i = end;
    }
  }
  return <>{parts}</>;
};

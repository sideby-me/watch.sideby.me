'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { TypingUser } from '@/types';

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
  mode?: 'sidebar' | 'overlay';
}

export function TypingIndicator({ typingUsers, mode = 'sidebar' }: TypingIndicatorProps) {
  const isVisible = typingUsers.length > 0;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const avatarSize = mode === 'overlay' ? 'h-6 w-6' : 'h-8 w-8';
  const textSize = mode === 'overlay' ? 'text-sm' : 'text-sm';

  return (
    <div
      className={`flex space-x-3 transition-all duration-200 ${
        isVisible ? 'opacity-100' : 'pointer-events-none h-0 overflow-hidden opacity-0'
      }`}
    >
      {/* Avatar */}
      <Avatar className={`${avatarSize} flex-shrink-0`}>
        <AvatarFallback className="font-mono text-primary-800">
          {typingUsers.length === 1 ? getInitials(typingUsers[0].userName) : '...'}
        </AvatarFallback>
      </Avatar>

      {/* Message Info */}
      <div className="flex-1 space-y-1">
        <div className="flex items-center space-x-2">
          <span className={`${textSize} font-bold tracking-tight text-neutral`}>
            {typingUsers.length === 1
              ? `${typingUsers[0].userName} is typing`
              : `${typingUsers.length} people are typing`}
          </span>
        </div>

        {/* Typing Indicator */}
        <div className="inline-block rounded-md bg-muted px-3 py-2">
          <div className="flex space-x-1">
            <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
            <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
            <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    </div>
  );
}

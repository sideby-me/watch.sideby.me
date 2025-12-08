'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageCircle } from 'lucide-react';
import { ChatMessage, TypingUser } from '@/types';
import { Chat } from '@/components/chat/chat';
import { useFullscreenPortalContainer } from '@/hooks/use-fullscreen-portal-container';

interface VoiceConfig {
  isEnabled: boolean;
  isMuted: boolean;
  isConnecting: boolean;
  participantCount: number;
  overCap: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onToggleMute: () => void;
}

interface VideoConfig {
  isEnabled: boolean;
  isCameraOff: boolean;
  isConnecting: boolean;
  enable: () => Promise<void> | void;
  disable: () => Promise<void> | void;
  toggleCamera: () => void;
  participantCount?: number;
}

interface ChatOverlayProps {
  messages: ChatMessage[];
  currentUserId: string;
  users?: { id: string; name: string }[];
  onSendMessage: (
    message: string,
    replyTo?: { messageId: string; userId: string; userName: string; message: string }
  ) => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  typingUsers?: TypingUser[];
  voice?: VoiceConfig;
  video?: VideoConfig;
  isVisible: boolean;
  isMinimized: boolean;
  onToggleMinimize: () => void;
  onClose: () => void;
  onMarkMessagesAsRead?: () => void;
  onTimestampClick?: (seconds: number) => void;
}

export function ChatOverlay({
  messages,
  currentUserId,
  users = [],
  onSendMessage,
  onTypingStart,
  onTypingStop,
  onToggleReaction,
  typingUsers = [],
  voice,
  video,
  isVisible,
  isMinimized,
  onToggleMinimize,
  onClose,
  onMarkMessagesAsRead,
  onTimestampClick,
}: ChatOverlayProps) {
  const [isClient, setIsClient] = useState(false);
  const portalContainer = useFullscreenPortalContainer();

  // Calculate unread messages
  const unreadMessages = messages.filter(msg => msg.userId !== currentUserId && !msg.isRead);
  const unreadCount = unreadMessages.length;

  // Handle client-side rendering
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Mark messages as read when chat is visible and not minimized
  useEffect(() => {
    if (isVisible && !isMinimized && unreadCount > 0) {
      onMarkMessagesAsRead?.();
    }
  }, [isVisible, isMinimized, unreadCount, onMarkMessagesAsRead]);

  if (!isVisible || !isClient) {
    return null;
  }

  const overlayContent = (
    <div
      className={`fixed right-6 top-6 z-[2147483647] border border-border bg-background shadow-lg ${
        isMinimized ? 'h-12 w-12 rounded-full' : 'h-96 w-80 rounded-lg'
      }`}
    >
      {isMinimized ? (
        /* Minimized State - Just icon with badge */
        <div className="flex h-full w-full items-center justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleMinimize}
            className="relative h-8 w-8 p-0 hover:bg-background/50"
            title="Expand chat"
          >
            <MessageCircle className="h-4 w-4" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full p-0 text-xs"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </Button>
        </div>
      ) : (
        <Chat
          mode="overlay"
          messages={messages}
          currentUserId={currentUserId}
          users={users}
          onSendMessage={onSendMessage}
          onTypingStart={onTypingStart}
          onTypingStop={onTypingStop}
          onToggleReaction={onToggleReaction}
          typingUsers={typingUsers}
          voice={voice}
          video={video}
          unreadCount={unreadCount}
          onToggleMinimize={onToggleMinimize}
          onClose={onClose}
          onTimestampClick={onTimestampClick}
        />
      )}
    </div>
  );

  // Render to fullscreen element if available, otherwise document.body
  const portalTarget = portalContainer || document.body;
  return createPortal(overlayContent, portalTarget);
}

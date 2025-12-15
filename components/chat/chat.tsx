'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle } from 'lucide-react';
import { ChatMessage, TypingUser } from '@/types';
import { useNotificationSound } from '@/hooks/use-notification-sound';
import { ChatHeader } from './chat-header';
import { ChatMessageItem } from './chat-message';
import { ChatInput } from './chat-input';
import { TypingIndicator } from './typing-indicator';

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

export interface ChatProps {
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
  className?: string;
  voice?: VoiceConfig;
  video?: VideoConfig;
  onTimestampClick?: (seconds: number) => void;
  // Mode props
  mode?: 'sidebar' | 'overlay';
  unreadCount?: number;
  onToggleMinimize?: () => void;
  onClose?: () => void;
}

export function Chat({
  messages,
  currentUserId,
  users = [],
  onSendMessage,
  onTypingStart,
  onTypingStop,
  onToggleReaction,
  typingUsers = [],
  className,
  voice,
  video,
  onTimestampClick,
  mode = 'sidebar',
  unreadCount = 0,
  onToggleMinimize,
  onClose,
}: ChatProps) {
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [previousMessageCount, setPreviousMessageCount] = useState(0);
  const [replyTo, setReplyTo] = useState<{ messageId: string; userName: string; message: string } | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Notification sound hook
  const { enabled: soundEnabled, toggleEnabled: toggleSound, playNotification } = useNotificationSound();

  // Helper function to scroll to bottom
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollAreaRef.current) {
      if (mode === 'sidebar') {
        const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollContainer) {
          scrollContainer.scrollTo({
            top: scrollContainer.scrollHeight,
            behavior,
          });
        }
      } else {
        scrollAreaRef.current.scrollTo({
          top: scrollAreaRef.current.scrollHeight,
          behavior,
        });
      }
    }
  };

  // Wrapper for onToggleReaction that scrolls after reacting
  const handleToggleReaction = (messageId: string, emoji: string) => {
    onToggleReaction?.(messageId, emoji);
    // Scroll after reaction - use small delay to let the UI update
    setTimeout(() => scrollToBottom(), 100);
  };

  // Auto-scroll to bottom only when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && messages.length > previousMessageCount) {
      scrollToBottom();

      // Play notification sound for new messages from other users
      if (previousMessageCount > 0) {
        const newMessages = messages.slice(previousMessageCount);
        const hasNewMessageFromOther = newMessages.some(msg => msg.userId !== currentUserId);

        if (hasNewMessageFromOther) {
          playNotification();
        }
      }
    }
    setPreviousMessageCount(messages.length);
  }, [messages, previousMessageCount, currentUserId, playNotification, mode]);

  // Scroll to bottom when typing users change
  useEffect(() => {
    if (typingUsers.length > 0) {
      scrollToBottom();
    }
  }, [typingUsers, mode]);

  // Handle typing indicators
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputMessage(value);

    // Start typing indicator
    if (value.trim() && !isTyping) {
      setIsTyping(true);
      onTypingStart?.();
    }

    // Reset typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 1 second of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping) {
        setIsTyping(false);
        onTypingStop?.();
      }
    }, 1000);

    // Stop typing immediately if input is empty
    if (!value.trim() && isTyping) {
      setIsTyping(false);
      onTypingStop?.();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    if (inputMessage.trim()) {
      const replyData = replyTo
        ? {
            messageId: replyTo.messageId,
            userId: messages.find(m => m.id === replyTo.messageId)?.userId || '',
            userName: replyTo.userName,
            message: replyTo.message,
          }
        : undefined;

      onSendMessage(inputMessage.trim(), replyData);
      setInputMessage('');
      setReplyTo(null); // Clear reply after sending

      // Stop typing indicator when message is sent
      if (isTyping) {
        setIsTyping(false);
        onTypingStop?.();
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  const handleReply = (messageId: string, userName: string, messageText: string) => {
    const truncatedMessage = messageText.length > 150 ? messageText.slice(0, 150) + '...' : messageText;
    setReplyTo({
      messageId,
      userName,
      message: truncatedMessage,
    });
    // Focus the input after setting reply
    setTimeout(() => {
      const input = document.querySelector('input[placeholder="Don\'t be shy..."]') as HTMLInputElement;
      input?.focus();
    }, 100);
  };

  const handleCancelReply = () => {
    setReplyTo(null);
  };

  const handleQuoteClick = (messageId: string) => {
    const messageRef = messageRefs.current.get(messageId);
    if (messageRef) {
      messageRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a temporary highlight effect
      messageRef.classList.add('bg-primary/20');
      setTimeout(() => {
        messageRef.classList.remove('bg-primary/20');
      }, 2000);
    }
  };

  // Empty state component
  const EmptyState = () => (
    <div className="py-6 text-center text-muted-foreground">
      <MessageCircle className="mx-auto mb-2 h-8 w-8 opacity-50" />
      <p>{`It's quiet in here... too quiet :/ Start the conversation!`}</p>
    </div>
  );

  // Render sidebar mode
  if (mode === 'sidebar') {
    return (
      <Card className={`ml-0 xl:ml-6 ${className}`}>
        {/* Header */}
        <CardHeader className="p-0">
          <CardTitle>
            <ChatHeader
              mode="sidebar"
              messageCount={messages.length}
              soundEnabled={soundEnabled}
              onSoundToggle={toggleSound}
              voice={voice}
              video={video}
            />
          </CardTitle>
        </CardHeader>

        {/* Messages */}
        <CardContent className="p-0">
          <ScrollArea className="4xl:h-[640px] 3xl:h-[480px] h-96 px-4" ref={scrollAreaRef}>
            <div className="min-w-0 space-y-4 pb-4">
              {messages.length === 0 ? (
                <EmptyState />
              ) : (
                messages.map(message => (
                  <div
                    key={message.id}
                    ref={el => {
                      if (el) {
                        messageRefs.current.set(message.id, el);
                      } else {
                        messageRefs.current.delete(message.id);
                      }
                    }}
                    className="rounded-lg transition-colors duration-300"
                  >
                    <ChatMessageItem
                      message={message}
                      currentUserId={currentUserId}
                      mode="sidebar"
                      onToggleReaction={handleToggleReaction}
                      onReply={handleReply}
                      onQuoteClick={handleQuoteClick}
                      users={users}
                      onTimestampClick={onTimestampClick}
                    />
                  </div>
                ))
              )}

              <TypingIndicator typingUsers={typingUsers} mode="sidebar" />
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <ChatInput
            inputMessage={inputMessage}
            onInputChange={handleInputChange}
            onValueChange={v => setInputMessage(v)}
            onSubmit={handleSendMessage}
            voice={voice}
            video={video}
            mode="sidebar"
            replyTo={replyTo}
            onCancelReply={handleCancelReply}
            onEmojiSelect={emoji => {
              setInputMessage(prev => (prev + emoji).slice(0, 500));
              if (!isTyping) {
                setIsTyping(true);
                onTypingStart?.();
              }
            }}
            users={users}
            currentUserId={currentUserId}
          />
        </CardContent>
      </Card>
    );
  }

  // Render overlay mode
  return (
    <>
      {/* Header */}
      <ChatHeader
        mode="overlay"
        unreadCount={unreadCount}
        soundEnabled={soundEnabled}
        onSoundToggle={toggleSound}
        voice={voice}
        video={video}
        onToggleMinimize={onToggleMinimize}
        onClose={onClose}
      />

      {/* Messages */}
      <div ref={scrollAreaRef} className="h-64 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <MessageCircle className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p>{`It's quiet in here... too quiet :/ Start the conversation!`}</p>
          </div>
        ) : (
          messages.map(message => (
            <div
              key={message.id}
              ref={el => {
                if (el) {
                  messageRefs.current.set(message.id, el);
                } else {
                  messageRefs.current.delete(message.id);
                }
              }}
              className="transition-colors duration-500"
            >
              <ChatMessageItem
                message={message}
                currentUserId={currentUserId}
                mode="overlay"
                onToggleReaction={handleToggleReaction}
                onReply={handleReply}
                onQuoteClick={handleQuoteClick}
                users={users}
                onTimestampClick={onTimestampClick}
              />
            </div>
          ))
        )}

        <TypingIndicator typingUsers={typingUsers} mode="overlay" />
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput
        inputMessage={inputMessage}
        onInputChange={handleInputChange}
        onValueChange={v => setInputMessage(v)}
        onSubmit={handleSendMessage}
        voice={voice}
        video={video}
        mode="overlay"
        replyTo={replyTo}
        onCancelReply={handleCancelReply}
        onEmojiSelect={emoji => {
          setInputMessage(prev => (prev + emoji).slice(0, 500));
          if (!isTyping) {
            setIsTyping(true);
            onTypingStart?.();
          }
        }}
        users={users}
        currentUserId={currentUserId}
      />
    </>
  );
}

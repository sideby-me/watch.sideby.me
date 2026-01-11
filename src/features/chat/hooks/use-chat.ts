'use client';

import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { ChatMessage, TypingUser } from '@/types';

interface UseChatOptions {
  roomId: string;
  currentUserId: string | undefined;
  socket: Socket | null;
  isConnected: boolean;
}

interface UseChatReturn {
  messages: ChatMessage[];
  typingUsers: TypingUser[];
  handleSendMessage: (
    message: string,
    replyTo?: { messageId: string; userId: string; userName: string; message: string }
  ) => void;
  handleTypingStart: () => void;
  handleTypingStop: () => void;
  handleToggleReaction: (messageId: string, emoji: string) => void;
  markMessagesAsRead: () => void;
  clearTypingUser: (userId: string) => void;
}

export function useChat({ roomId, currentUserId, socket, isConnected }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  // Socket event handlers for chat
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleNewMessage = ({ message }: { message: ChatMessage }) => {
      // Mark messages as read if they're from the current user, unread otherwise
      const messageWithReadStatus = {
        ...message,
        isRead: message.userId === currentUserId || false,
      };
      setMessages(prev => [...prev, messageWithReadStatus]);
    };

    const handleUserTyping = ({ userId, userName }: { userId: string; userName: string }) => {
      if (userId === currentUserId) return;

      setTypingUsers(prev => {
        const existing = prev.find(user => user.userId === userId);
        if (existing) {
          return prev.map(user => (user.userId === userId ? { ...user, timestamp: Date.now() } : user));
        }
        return [...prev, { userId, userName, timestamp: Date.now() }];
      });
    };

    const handleUserStoppedTyping = ({ userId }: { userId: string }) => {
      setTypingUsers(prev => prev.filter(user => user.userId !== userId));
    };

    const handleReactionUpdated = ({
      messageId,
      reactions,
    }: {
      messageId: string;
      reactions: Record<string, string[]>;
    }) => {
      setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, reactions } : m)));
    };

    socket.on('new-message', handleNewMessage);
    socket.on('user-typing', handleUserTyping);
    socket.on('user-stopped-typing', handleUserStoppedTyping);
    socket.on('reaction-updated', handleReactionUpdated);

    return () => {
      socket.off('new-message', handleNewMessage);
      socket.off('user-typing', handleUserTyping);
      socket.off('user-stopped-typing', handleUserStoppedTyping);
      socket.off('reaction-updated', handleReactionUpdated);
    };
  }, [socket, isConnected, currentUserId]);

  // Actions
  const handleSendMessage = useCallback(
    (message: string, replyTo?: { messageId: string; userId: string; userName: string; message: string }) => {
      if (!socket) return;
      socket.emit('send-message', { roomId, message, replyTo });
    },
    [socket, roomId]
  );

  const handleTypingStart = useCallback(() => {
    if (!socket) return;
    socket.emit('typing-start', { roomId });
  }, [socket, roomId]);

  const handleTypingStop = useCallback(() => {
    if (!socket) return;
    socket.emit('typing-stop', { roomId });
  }, [socket, roomId]);

  const handleToggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      if (!socket) return;
      socket.emit('toggle-reaction', { roomId, messageId, emoji });
    },
    [socket, roomId]
  );

  const markMessagesAsRead = useCallback(() => {
    setMessages(prev => prev.map(message => ({ ...message, isRead: true })));
  }, []);

  // Clear typing user when they leave the room
  const clearTypingUser = useCallback((userId: string) => {
    setTypingUsers(prev => prev.filter(user => user.userId !== userId));
  }, []);

  return {
    messages,
    typingUsers,
    handleSendMessage,
    handleTypingStart,
    handleTypingStop,
    handleToggleReaction,
    markMessagesAsRead,
    clearTypingUser,
  };
}

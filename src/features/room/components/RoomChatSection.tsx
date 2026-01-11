'use client';

import { memo } from 'react';
import { Chat, ChatOverlay } from '@/components/chat';
import { ChatMessage, TypingUser, User } from '@/types';

interface VoiceChatProps {
  isEnabled: boolean;
  isMuted: boolean;
  isConnecting: boolean;
  participantCount: number;
  overCap: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onToggleMute: () => void;
}

interface VideoChatProps {
  isEnabled: boolean;
  isCameraOff: boolean;
  isConnecting: boolean;
  enable: () => void;
  disable: () => void;
  toggleCamera: () => void;
  participantCount: number;
}

interface RoomChatSectionProps {
  messages: ChatMessage[];
  currentUserId: string;
  users: User[];
  typingUsers: TypingUser[];
  isChatLocked: boolean | undefined;
  isHost: boolean;
  voice: VoiceChatProps;
  video: VideoChatProps;
  onSendMessage: (
    message: string,
    replyTo?: { messageId: string; userId: string; userName: string; message: string }
  ) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onTimestampClick: (seconds: number) => void;
}

export const RoomChatSection = memo(function RoomChatSection({
  messages,
  currentUserId,
  users,
  typingUsers,
  isChatLocked,
  isHost,
  voice,
  video,
  onSendMessage,
  onTypingStart,
  onTypingStop,
  onToggleReaction,
  onTimestampClick,
}: RoomChatSectionProps) {
  return (
    <Chat
      mode="sidebar"
      messages={messages}
      currentUserId={currentUserId}
      users={users.map(u => ({ id: u.id, name: u.name }))}
      onSendMessage={onSendMessage}
      onTypingStart={onTypingStart}
      onTypingStop={onTypingStop}
      onToggleReaction={onToggleReaction}
      typingUsers={typingUsers}
      voice={{
        isEnabled: voice.isEnabled,
        isMuted: voice.isMuted,
        isConnecting: voice.isConnecting,
        participantCount: voice.participantCount,
        overCap: voice.overCap,
        onEnable: voice.onEnable,
        onDisable: voice.onDisable,
        onToggleMute: voice.onToggleMute,
      }}
      onTimestampClick={onTimestampClick}
      video={{
        isEnabled: video.isEnabled,
        isCameraOff: video.isCameraOff,
        isConnecting: video.isConnecting,
        enable: video.enable,
        disable: video.disable,
        toggleCamera: video.toggleCamera,
        participantCount: video.participantCount,
      }}
      className="border-0 p-0"
      isChatLocked={isChatLocked}
      isHost={isHost}
    />
  );
});

interface RoomChatOverlayProps {
  messages: ChatMessage[];
  currentUserId: string;
  users: User[];
  typingUsers: TypingUser[];
  isChatLocked: boolean | undefined;
  isHost: boolean;
  voice: VoiceChatProps;
  video: VideoChatProps;
  isVisible: boolean;
  isMinimized: boolean;
  onSendMessage: (
    message: string,
    replyTo?: { messageId: string; userId: string; userName: string; message: string }
  ) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onTimestampClick: (seconds: number) => void;
  onToggleMinimize: () => void;
  onClose: () => void;
  onMarkMessagesAsRead: () => void;
}

export const RoomChatOverlaySection = memo(function RoomChatOverlaySection({
  messages,
  currentUserId,
  users,
  typingUsers,
  isChatLocked,
  isHost,
  voice,
  video,
  isVisible,
  isMinimized,
  onSendMessage,
  onTypingStart,
  onTypingStop,
  onToggleReaction,
  onTimestampClick,
  onToggleMinimize,
  onClose,
  onMarkMessagesAsRead,
}: RoomChatOverlayProps) {
  return (
    <ChatOverlay
      messages={messages}
      currentUserId={currentUserId}
      users={users.map(u => ({ id: u.id, name: u.name }))}
      onSendMessage={onSendMessage}
      onTypingStart={onTypingStart}
      onTypingStop={onTypingStop}
      onToggleReaction={onToggleReaction}
      typingUsers={typingUsers}
      isVisible={isVisible}
      isMinimized={isMinimized}
      onToggleMinimize={onToggleMinimize}
      onClose={onClose}
      onMarkMessagesAsRead={onMarkMessagesAsRead}
      voice={{
        isEnabled: voice.isEnabled,
        isMuted: voice.isMuted,
        isConnecting: voice.isConnecting,
        participantCount: voice.participantCount,
        overCap: voice.overCap,
        onEnable: voice.onEnable,
        onDisable: voice.onDisable,
        onToggleMute: voice.onToggleMute,
      }}
      video={{
        isEnabled: video.isEnabled,
        isCameraOff: video.isCameraOff,
        isConnecting: video.isConnecting,
        enable: video.enable,
        disable: video.disable,
        toggleCamera: video.toggleCamera,
        participantCount: video.participantCount,
      }}
      onTimestampClick={onTimestampClick}
      isChatLocked={isChatLocked}
      isHost={isHost}
    />
  );
});

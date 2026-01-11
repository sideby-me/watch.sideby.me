// ChatService - Business logic for chat operations.

import { v4 as uuidv4 } from 'uuid';
import { redisService } from '@/server/redis';
import type { ChatMessage } from '@/types';
import type { SocketContext } from './SocketContext';
import { NotFoundError, PermissionError } from '../errors';

// Request Types

export interface SendMessageRequest {
  roomId: string;
  message: string;
  replyTo?: {
    messageId: string;
    userId: string;
    userName: string;
    message: string;
  };
}

export interface ToggleReactionRequest {
  roomId: string;
  messageId: string;
  emoji: string;
}

// Result Types

export interface SendMessageResult {
  message: ChatMessage;
}

export interface ToggleReactionResult {
  messageId: string;
  emoji: string;
  userId: string;
  reactions: Record<string, string[]>;
  action: 'added' | 'removed';
}

// ChatService

class ChatServiceImpl {
  // Send a chat message.
  async sendMessage(request: SendMessageRequest, ctx: SocketContext): Promise<SendMessageResult> {
    const { roomId, message, replyTo } = request;

    // Check if chat is locked for non-hosts
    const room = await redisService.rooms.getRoom(roomId);
    if (room?.settings?.isChatLocked) {
      const user = room.users.find(u => u.id === ctx.userId);
      if (!user?.isHost) {
        throw new PermissionError('Chat is currently locked. Only hosts can send messages.');
      }
    }

    const chatMessage: ChatMessage = {
      id: uuidv4(),
      userId: ctx.userId,
      userName: ctx.userName || 'Unknown',
      message: message.trim(),
      timestamp: new Date(),
      roomId,
      isRead: false,
      type: 'user',
      reactions: {},
      replyTo,
    };

    await redisService.chat.addChatMessage(roomId, chatMessage);

    console.log(`Message sent in room ${roomId} by ${ctx.userName}${replyTo ? ' (reply)' : ''}`);

    return { message: chatMessage };
  }

  // Toggle a reaction on a message.
  async toggleReaction(request: ToggleReactionRequest, ctx: SocketContext): Promise<ToggleReactionResult | null> {
    const { roomId, messageId, emoji } = request;

    let result: ToggleReactionResult | null = null;

    const updated = await redisService.chat.updateMessageReactions(roomId, messageId, message => {
      const reactions = { ...(message.reactions || {}) } as Record<string, string[]>;
      const users = new Set(reactions[emoji] || []);
      let action: 'added' | 'removed' = 'added';

      if (users.has(ctx.userId)) {
        users.delete(ctx.userId);
        action = 'removed';
      } else {
        users.add(ctx.userId);
      }

      const newUsers = Array.from(users);
      if (newUsers.length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = newUsers;
      }

      result = {
        messageId,
        emoji,
        userId: ctx.userId,
        reactions,
        action,
      };

      return { ...message, reactions };
    });

    if (!updated) {
      throw new NotFoundError('Message not found for reaction.');
    }

    return result;
  }
}

// Export singleton instance
export const ChatService = new ChatServiceImpl();

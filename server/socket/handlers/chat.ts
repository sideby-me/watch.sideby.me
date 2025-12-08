import { Socket, Server as IOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { redisService } from '@/server/redis';
import { ChatMessage, SendMessageDataSchema, RoomActionDataSchema, MessageReactionDataSchema } from '@/types';
import { SocketEvents, SocketData } from '../types';
import { validateData } from '../utils';

export function registerChatHandlers(socket: Socket<SocketEvents, SocketEvents, object, SocketData>, io: IOServer) {
  // Typing indicators
  socket.on('typing-start', async data => {
    try {
      const validatedData = validateData(RoomActionDataSchema, data, socket);
      if (!validatedData) return;

      const { roomId } = validatedData;

      if (!socket.data.userId || !socket.data.userName) {
        socket.emit('error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      // Broadcast to all other users in the room that this user is typing
      socket.to(roomId).emit('user-typing', {
        userId: socket.data.userId,
        userName: socket.data.userName,
      });

      console.log(`${socket.data.userName} started typing in room ${roomId}`);
    } catch (error) {
      console.error('Error handling typing start:', error);
      socket.emit('error', { error: `Just a heads-up: your 'typing...' indicator might not be working right now.` });
    }
  });

  socket.on('typing-stop', async data => {
    try {
      const validatedData = validateData(RoomActionDataSchema, data, socket);
      if (!validatedData) return;

      const { roomId } = validatedData;

      if (!socket.data.userId) {
        socket.emit('error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      // Broadcast to all other users in the room that this user stopped typing
      socket.to(roomId).emit('user-stopped-typing', {
        userId: socket.data.userId,
      });

      console.log(`${socket.data.userName} stopped typing in room ${roomId}`);
    } catch (error) {
      console.error('Error handling typing stop:', error);
      socket.emit('error', {
        error: `We're having a little trouble with the typing notifications. Your messages should still send fine!`,
      });
    }
  });

  // Send chat message
  socket.on('send-message', async data => {
    try {
      const validatedData = validateData(SendMessageDataSchema, data, socket);
      if (!validatedData) return;

      const { roomId, message, replyTo } = validatedData;

      if (!socket.data.userId || !socket.data.userName) {
        socket.emit('error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      const chatMessage: ChatMessage = {
        id: uuidv4(),
        userId: socket.data.userId,
        userName: socket.data.userName,
        message: message.trim(),
        timestamp: new Date(),
        roomId,
        isRead: false,
        type: 'user',
        reactions: {},
        replyTo,
      };

      await redisService.chat.addChatMessage(roomId, chatMessage);

      io.to(roomId).emit('new-message', { message: chatMessage });

      console.log(`Message sent in room ${roomId} by ${socket.data.userName}${replyTo ? ' (reply)' : ''}`);
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', {
        error: 'Your message got lost in the void! Sorry about that. Please try sending it one more time.',
      });
    }
  });

  // Toggle reaction
  socket.on('toggle-reaction', async data => {
    try {
      const validatedData = validateData(MessageReactionDataSchema, data, socket);
      if (!validatedData) return;
      const { roomId, messageId, emoji } = validatedData;

      if (!socket.data.userId || !socket.data.userName) {
        socket.emit('error', { error: 'Lost your identity; cannot react right now.' });
        return;
      }

      const updated = await redisService.chat.updateMessageReactions(roomId, messageId, message => {
        const reactions = { ...(message.reactions || {}) } as Record<string, string[]>;
        const users = new Set(reactions[emoji] || []);
        let action: 'added' | 'removed' = 'added';
        if (users.has(socket.data.userId!)) {
          users.delete(socket.data.userId!);
          action = 'removed';
        } else {
          users.add(socket.data.userId!);
        }
        const newUsers = Array.from(users);
        if (newUsers.length === 0) {
          delete reactions[emoji];
        } else {
          reactions[emoji] = newUsers;
        }
        const newMessage: ChatMessage = { ...message, reactions };
        // Emit from here (after update) because we need action
        io.to(roomId).emit('reaction-updated', {
          messageId: newMessage.id,
          emoji,
          userId: socket.data.userId,
          reactions,
          action,
        });
        return newMessage;
      });

      if (!updated) {
        socket.emit('error', { error: 'Message not found for reaction.' });
      }
    } catch (error) {
      console.error('Error toggling reaction:', error);
      socket.emit('error', { error: 'Could not update reaction.' });
    }
  });
}

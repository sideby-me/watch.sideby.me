import { Socket, Server as IOServer } from 'socket.io';
import { SendMessageDataSchema, RoomActionDataSchema, MessageReactionDataSchema } from '@/types';
import { SocketEvents, SocketData } from '../types';
import { validateData } from '../utils';
import { handleServiceError } from '../error-handler';
import { ChatService, createSocketContext } from '@/server/services';

export function registerChatHandlers(socket: Socket<SocketEvents, SocketEvents, object, SocketData>, io: IOServer) {
  // Typing indicators (stateless relay - no service needed)
  socket.on('typing-start', async data => {
    try {
      const validatedData = validateData(RoomActionDataSchema, data, socket);
      if (!validatedData) return;

      const { roomId } = validatedData;

      if (!socket.data.userId || !socket.data.userName) {
        socket.emit('error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      socket.to(roomId).emit('user-typing', {
        userId: socket.data.userId,
        userName: socket.data.userName,
      });

      console.log(`${socket.data.userName} started typing in room ${roomId}`);
    } catch (error) {
      console.error('Error handling typing start:', error);
      socket.emit('error', { error: "Just a heads-up: your 'typing...' indicator might not be working right now." });
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

      socket.to(roomId).emit('user-stopped-typing', {
        userId: socket.data.userId,
      });

      console.log(`${socket.data.userName} stopped typing in room ${roomId}`);
    } catch (error) {
      console.error('Error handling typing stop:', error);
      socket.emit('error', {
        error: "We're having a little trouble with the typing notifications. Your messages should still send fine!",
      });
    }
  });

  // Send chat message
  socket.on('send-message', async data => {
    try {
      const validatedData = validateData(SendMessageDataSchema, data, socket);
      if (!validatedData) return;

      const ctx = createSocketContext(socket.data);
      if (!ctx || !socket.data.userName) {
        socket.emit('error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      const result = await ChatService.sendMessage(
        {
          roomId: validatedData.roomId,
          message: validatedData.message,
          replyTo: validatedData.replyTo,
        },
        { ...ctx, userName: socket.data.userName }
      );

      io.to(validatedData.roomId).emit('new-message', { message: result.message });
    } catch (error) {
      handleServiceError(error, socket);
    }
  });

  // Toggle reaction
  socket.on('toggle-reaction', async data => {
    try {
      const validatedData = validateData(MessageReactionDataSchema, data, socket);
      if (!validatedData) return;

      const ctx = createSocketContext(socket.data);
      if (!ctx) {
        socket.emit('error', { error: 'Lost your identity; cannot react right now.' });
        return;
      }

      const result = await ChatService.toggleReaction(
        {
          roomId: validatedData.roomId,
          messageId: validatedData.messageId,
          emoji: validatedData.emoji,
        },
        ctx
      );

      if (result) {
        io.to(validatedData.roomId).emit('reaction-updated', result);
      }
    } catch (error) {
      handleServiceError(error, socket);
    }
  });
}

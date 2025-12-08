import { Socket, Server as IOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { SocketEvents, SocketData } from './types';
import { ChatMessage } from '@/types';

// Helper function for validating data with Zod schemas
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  socket: Socket<SocketEvents, SocketEvents, object, SocketData>
): T | null {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Validation error:', error.issues);
      socket.emit('room-error', {
        error: `Invalid data: ${error.issues.map(issue => issue.message).join(', ')}`,
      });
    } else {
      console.error('❌ Unexpected validation error:', error);
      socket.emit('room-error', { error: 'Invalid data provided' });
    }
    return null;
  }
}

export function emitSystemMessage(
  io: IOServer,
  roomId: string,
  message: string,
  systemType: ChatMessage['systemType'],
  eventData?: Record<string, any>
) {
  const systemMessage: ChatMessage = {
    id: uuidv4(),
    userId: 'system',
    userName: 'System',
    message,
    timestamp: new Date(),
    roomId,
    isRead: true,
    type: 'system',
    systemType,
    eventData,
    reactions: {},
  };

  io.to(roomId).emit('new-message', { message: systemMessage });
}

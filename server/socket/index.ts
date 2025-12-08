import { Server as IOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { Socket } from 'socket.io';
import { SocketEvents, SocketData } from './types';
import { registerRoomHandlers } from './handlers/room';
import { registerVideoHandlers } from './handlers/video';
import { registerChatHandlers } from './handlers/chat';
import { registerVoiceHandlers } from './handlers/voice';
import { registerVideoChatHandlers } from './handlers/videochat';
import { handleDisconnect } from './handlers/disconnect';

let io: IOServer | undefined;

export function initSocketIO(httpServer: HTTPServer): IOServer {
  if (io) {
    return io;
  }

  io = new IOServer(httpServer, {
    cors: {
      origin:
        process.env.NODE_ENV === 'production'
          ? process.env.ALLOWED_ORIGINS?.split(',') || []
          : ['http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/api/socket/io',
  });

  io.on('connection', (socket: Socket<SocketEvents, SocketEvents, object, SocketData>) => {
    console.log('User connected:', socket.id);

    // Register all handlers - io is guaranteed to be defined here
    registerRoomHandlers(socket, io!);
    registerVideoHandlers(socket, io!);
    registerChatHandlers(socket, io!);
    registerVoiceHandlers(socket, io!);
    registerVideoChatHandlers(socket, io!);

    // Handle disconnect
    socket.on('disconnect', () => handleDisconnect(socket, io!));
  });

  return io;
}

export { io };

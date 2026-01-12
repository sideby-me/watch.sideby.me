import { Socket } from 'socket.io';
import { SocketEvents, SocketData } from '../types';
import { handleLeaveRoom } from './room';
import { Server } from 'socket.io';
import { logEvent } from '@/server/logger';

export async function handleDisconnect(
  socket: Socket<SocketEvents, SocketEvents, object, SocketData>,
  io: Server<SocketEvents, SocketEvents, object, SocketData>
) {
  logEvent({
    level: 'info',
    domain: 'room',
    event: 'user_disconnected',
    message: 'socket.disconnect: connection dropped',
    userId: socket.data.userId,
    roomId: socket.data.roomId,
    meta: { socketId: socket.id },
  });

  if (socket.data.roomId && socket.data.userId) {
    await handleLeaveRoom(socket, socket.data.roomId, false, io);
  }
}

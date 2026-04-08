import { SocketEvents as ImportedSocketEvents } from '@/types';

export interface SocketData {
  userId: string;
  userName: string;
  roomId?: string;
  isHost?: boolean;
  requestId?: string;
  traceId?: string;
  spanId?: string;
}

export type SocketEvents = ImportedSocketEvents;

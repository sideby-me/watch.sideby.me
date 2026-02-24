import { SocketEvents as ImportedSocketEvents } from '@/types';

export interface SocketData {
  userId: string;
  userName: string;
  roomId?: string;
  isHost?: boolean;
}

export type SocketEvents = ImportedSocketEvents;

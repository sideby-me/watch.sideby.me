export interface SocketContext {
  userId: string;
  userName?: string;
  roomId?: string;
}

export function createSocketContext(socketData: {
  userId?: string;
  userName?: string;
  roomId?: string;
}): SocketContext | null {
  if (!socketData.userId) {
    return null;
  }
  return {
    userId: socketData.userId,
    userName: socketData.userName,
    roomId: socketData.roomId,
  };
}

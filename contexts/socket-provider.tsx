'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '@/types';

interface SocketContextType {
  socket: Socket<SocketEvents, SocketEvents> | null;
  isConnected: boolean;
  isInitialized: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  isInitialized: false,
});

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket<SocketEvents, SocketEvents> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    console.log('🚀 Initializing socket...');

    const socketUrl = process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3000';

    const socketInstance = io(socketUrl, {
      path: '/api/socket/io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    setSocket(socketInstance);

    const handleConnect = () => {
      console.log('✅ Socket connected:', socketInstance.id);
      setIsConnected(true);
      setIsInitialized(true);
    };

    const handleDisconnect = (reason: string) => {
      console.log('❌ Socket disconnected:', reason);
      setIsConnected(false);
    };

    const handleConnectError = (error: Error) => {
      console.error('🚨 Socket connection error:', error);
      setIsConnected(false);
    };

    // Attach listeners
    socketInstance.on('connect', handleConnect);
    socketInstance.on('disconnect', handleDisconnect);
    socketInstance.on('connect_error', handleConnectError);

    return () => {
      console.log('🧹 Cleaning up socket...');
      socketInstance.off('connect', handleConnect);
      socketInstance.off('disconnect', handleDisconnect);
      socketInstance.off('connect_error', handleConnectError);
      socketInstance.disconnect();
    };
  }, []); // Run once

  return <SocketContext.Provider value={{ socket, isConnected, isInitialized }}>{children}</SocketContext.Provider>;
};

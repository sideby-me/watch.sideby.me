'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/use-socket';
import { CreateRoomDataSchema } from '@/types';
import { z } from 'zod';
import { roomSessionStorage } from '@/lib/session-storage';

interface UseCreateRoomReturn {
  hostName: string;
  setHostName: (name: string) => void;
  isLoading: boolean;
  error: string;
  isConnected: boolean;
  isInitialized: boolean;
  handleCreateRoom: (e: React.FormEvent) => Promise<void>;
}

interface UseCreateRoomOptions {
  onRoomCreated?: (args: { roomId: string; hostToken: string }) => void;
}

export function useCreateRoom(options?: UseCreateRoomOptions): UseCreateRoomReturn {
  const [hostName, setHostName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { socket, isConnected, isInitialized } = useSocket();
  const router = useRouter();

  const handleCreateRoom = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      try {
        // Validate with Zod schema
        const validatedData = CreateRoomDataSchema.parse({
          hostName: hostName.trim(),
        });

        if (!socket || !isConnected) {
          setError(`Oof, couldn't reach the server on that one.`);
          return;
        }

        setIsLoading(true);

        // Listen for room creation response
        socket.once('room-created', ({ roomId, hostToken }) => {
          setIsLoading(false);
          // Store creator info so room page knows not to prompt again
          roomSessionStorage.setRoomCreator({
            roomId,
            hostName: validatedData.hostName,
            hostToken,
          });

          if (options?.onRoomCreated) {
            options.onRoomCreated({ roomId, hostToken });
          } else {
            // Navigate immediately - the room page will handle the room-created event
            router.push(`/room/${roomId}`);
          }
        });

        socket.once('room-error', ({ error }) => {
          setIsLoading(false);
          setError(error);
        });

        // Create the room
        socket.emit('create-room', validatedData);
      } catch (error) {
        if (error instanceof z.ZodError) {
          setError(error.issues[0].message);
        } else {
          setError("Our system is a bit picky with names. Let's try a different one.");
        }
      }
    },
    [hostName, socket, isConnected, router, options]
  );

  return {
    hostName,
    setHostName,
    isLoading,
    error,
    isConnected,
    isInitialized,
    handleCreateRoom,
  };
}

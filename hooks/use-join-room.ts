'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/use-socket';
import { JoinRoomDataSchema, RoomIdSchema, UserNameSchema } from '@/types';
import { z } from 'zod';
import { roomSessionStorage } from '@/lib/session-storage';

interface UseJoinRoomReturn {
  roomId: string;
  setRoomId: (id: string) => void;
  userName: string;
  setUserName: (name: string) => void;
  isLoading: boolean;
  error: string;
  isConnected: boolean;
  isInitialized: boolean;
  handleJoinRoom: (e: React.FormEvent) => Promise<void>;
  handleRoomIdChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function useJoinRoom(): UseJoinRoomReturn {
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { socket, isConnected, isInitialized } = useSocket();
  const router = useRouter();

  const handleJoinRoom = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      try {
        // Validate with Zod schemas
        const roomIdResult = RoomIdSchema.safeParse(roomId.trim().toUpperCase());
        if (!roomIdResult.success) {
          setError(roomIdResult.error.issues[0].message);
          return;
        }

        const userNameResult = UserNameSchema.safeParse(userName.trim());
        if (!userNameResult.success) {
          setError(userNameResult.error.issues[0].message);
          return;
        }

        const joinData = {
          roomId: roomIdResult.data,
          userName: userNameResult.data,
        };

        // Validate the complete join data
        const validatedData = JoinRoomDataSchema.parse(joinData);

        if (!socket || !isConnected) {
          setError(`Oof, couldn't reach the server on that one.`);
          return;
        }

        setIsLoading(true);

        // Listen for room join response
        socket.once('room-joined', () => {
          setIsLoading(false);
          // Store the join data for the room page
          roomSessionStorage.setJoinData({
            roomId: validatedData.roomId,
            userName: validatedData.userName,
          });
          router.push(`/room/${validatedData.roomId}`);
        });

        socket.once('room-error', ({ error }) => {
          setIsLoading(false);
          setError(error);
        });

        // Handle passcode required - redirect to room page where passcode dialog is shown
        socket.once('passcode-required', ({ roomId: reqRoomId }) => {
          console.log(`🔑 Passcode required for room ${reqRoomId}, redirecting to room page`);
          setIsLoading(false);
          // Store the join data so room page can use it for passcode verification
          roomSessionStorage.setJoinData({
            roomId: validatedData.roomId,
            userName: validatedData.userName,
          });
          router.push(`/room/${validatedData.roomId}`);
        });

        // Join the room
        socket.emit('join-room', validatedData);
      } catch (error) {
        if (error instanceof z.ZodError) {
          setError(error.issues[0].message);
        } else {
          setError(`Hmm, something's not quite right. Could you double-check the room code and your name?`);
        }
      }
    },
    [roomId, userName, socket, isConnected, router]
  );

  const handleRoomIdChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length <= 6) {
      setRoomId(value);
    }
  }, []);

  return {
    roomId,
    setRoomId,
    userName,
    setUserName,
    isLoading,
    error,
    isConnected,
    isInitialized,
    handleJoinRoom,
    handleRoomIdChange,
  };
}

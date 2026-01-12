'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { Room, User, RoomSettings, VideoSetResponse } from '@/types';
import { logClient, logDebug } from '@/src/core/logger';

interface UseRoomCoreOptions {
  roomId: string;
  socket: Socket | null;
  isConnected: boolean;
}

interface UseRoomCoreReturn {
  // State
  room: Room | null;
  currentUser: User | null;
  error: string;
  syncError: string;
  isJoining: boolean;

  // Refs
  hasAttemptedJoinRef: React.MutableRefObject<boolean>;
  cleanupDataRef: React.MutableRefObject<{
    socket: Socket | null;
    isConnected: boolean;
    roomId: string;
    room: Room | null;
    currentUser: User | null;
  }>;

  // State Setters (for use by other hooks/components)
  setRoom: React.Dispatch<React.SetStateAction<Room | null>>;
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  setSyncError: React.Dispatch<React.SetStateAction<string>>;
  setIsJoining: React.Dispatch<React.SetStateAction<boolean>>;

  // Actions
  handlePromoteUser: (userId: string) => void;
  handleKickUser: (userId: string) => void;
  handleUpdateRoomSettings: (settings: Partial<RoomSettings>) => void;
  emitJoinRoom: (userName: string, passcode?: string, hostToken?: string) => void;
  emitLeaveRoom: () => void;

  // Callbacks for UI state coordination
  onRoomJoined: (callback: (data: { room: Room; user: User }) => void) => void;
  onVideoSet: (callback: (data: VideoSetResponse) => void) => void;
  onUserLeft: (callback: (userId: string) => void) => void;
  onPasscodeRequired: (callback: () => void) => void;
  onPasscodeError: (callback: (error: string) => void) => void;
  onRoomClosed: (callback: () => void) => void;
  onUserKicked: (callback: () => void) => void;
  onRoomSettingsUpdated: (callback: (settings: RoomSettings) => void) => void;
}

export function useRoomCore({ roomId, socket, isConnected }: UseRoomCoreOptions): UseRoomCoreReturn {
  const [room, setRoom] = useState<Room | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const hasAttemptedJoinRef = useRef<boolean>(false);
  const hasShownClosureToastRef = useRef<boolean>(false);
  const cleanupDataRef = useRef<{
    socket: typeof socket;
    isConnected: boolean;
    roomId: string;
    room: Room | null;
    currentUser: User | null;
  }>({
    socket: null,
    isConnected: false,
    roomId: '',
    room: null,
    currentUser: null,
  });

  // Callback refs for coordination with UI state
  const onRoomJoinedRef = useRef<((data: { room: Room; user: User }) => void) | null>(null);
  const onVideoSetRef = useRef<((data: VideoSetResponse) => void) | null>(null);
  const onUserLeftRef = useRef<((userId: string) => void) | null>(null);
  const onPasscodeRequiredRef = useRef<(() => void) | null>(null);
  const onPasscodeErrorRef = useRef<((error: string) => void) | null>(null);
  const onRoomClosedRef = useRef<(() => void) | null>(null);
  const onUserKickedRef = useRef<(() => void) | null>(null);
  const onRoomSettingsUpdatedRef = useRef<((settings: RoomSettings) => void) | null>(null);

  // Socket event handlers
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleRoomJoined = ({ room: joinedRoom, user }: { room: Room; user: User }) => {
      logClient({
        level: 'info',
        domain: 'room',
        event: 'join_success',
        message: `Joined room ${joinedRoom.id} as ${user.isHost ? 'host' : 'guest'}`,
        meta: { roomId: joinedRoom.id, userName: user.name, isHost: user.isHost },
      });
      setRoom(joinedRoom);
      setCurrentUser(user);
      setError('');
      setIsJoining(false);
      hasAttemptedJoinRef.current = false;

      // Notify UI state hook
      onRoomJoinedRef.current?.({ room: joinedRoom, user });
    };

    const handleUserJoined = ({ user }: { user: User }) => {
      setRoom(prev => {
        if (!prev) return null;
        const existingUserIndex = prev.users.findIndex(u => u.id === user.id);
        if (existingUserIndex >= 0) {
          logDebug('room', 'user_update', `Updating existing user: ${user.name}`);
          const updatedUsers = [...prev.users];
          updatedUsers[existingUserIndex] = user;
          return { ...prev, users: updatedUsers };
        }
        logClient({ level: 'info', domain: 'room', event: 'user_joined', message: `${user.name} joined` });
        return { ...prev, users: [...prev.users, user] };
      });
    };

    const handleUserLeft = ({ userId }: { userId: string }) => {
      onUserLeftRef.current?.(userId);
      setRoom(prev => {
        if (!prev) return null;
        const updatedUsers = prev.users.filter(u => u.id !== userId);
        return { ...prev, users: updatedUsers };
      });
    };

    const handleUserPromoted = ({ userId, userName }: { userId: string; userName: string }) => {
      setRoom(prev => {
        if (!prev) return null;
        const updatedUsers = prev.users.map(user => (user.id === userId ? { ...user, isHost: true } : user));
        return { ...prev, users: updatedUsers };
      });

      setCurrentUser(prev => {
        if (prev && prev.id === userId) {
          logClient({
            level: 'info',
            domain: 'room',
            event: 'self_promoted',
            message: 'You have been promoted to host!',
          });
          return { ...prev, isHost: true };
        }
        return prev;
      });

      logClient({ level: 'info', domain: 'room', event: 'user_promoted', message: `${userName} promoted to host` });
    };

    const handleUserKicked = ({ userId, userName }: { userId: string; userName: string; kickedBy?: string }) => {
      // Check if WE are the one being kicked
      if (currentUser && userId === currentUser.id) {
        logClient({
          level: 'warn',
          domain: 'room',
          event: 'self_kicked',
          message: 'You have been kicked from the room',
        });
        onUserKickedRef.current?.();
        return; // Don't update room state - we're being redirected
      }

      // Otherwise just remove the user from room state
      setRoom(prev => {
        if (!prev) return null;

        const userExists = prev.users.some(u => u.id === userId);
        if (!userExists) return prev;

        logClient({ level: 'info', domain: 'room', event: 'user_kicked', message: `${userName} was kicked` });
        const updatedUsers = prev.users.filter(u => u.id !== userId);
        return {
          ...prev,
          users: [...updatedUsers],
        };
      });
    };

    const handleVideoSet = ({ videoUrl, videoType, videoMeta }: VideoSetResponse) => {
      setRoom(prev =>
        prev
          ? {
              ...prev,
              videoUrl,
              videoType,
              videoMeta: videoMeta ?? prev.videoMeta,
              videoState: {
                isPlaying: false,
                currentTime: 0,
                duration: 0,
                lastUpdateTime: Date.now(),
              },
            }
          : null
      );

      onVideoSetRef.current?.({ videoUrl, videoType, videoMeta });
    };

    const handleRoomError = ({ error: errorMsg }: { error: string }) => {
      logClient({ level: 'error', domain: 'room', event: 'room_error', message: errorMsg });

      // Handle room closure (all hosts left)
      if (
        errorMsg.includes('All hosts have left') ||
        errorMsg.includes('Redirecting to home page') ||
        errorMsg.includes('closing room') ||
        errorMsg.includes('sending you back home')
      ) {
        logClient({ level: 'info', domain: 'room', event: 'room_closed', message: 'Room closed by host departure' });

        if (hasShownClosureToastRef.current) {
          logDebug('room', 'closure_skip', 'Closure already handled, skipping duplicate');
          return;
        }
        hasShownClosureToastRef.current = true;

        onRoomClosedRef.current?.();
        return;
      }

      // Handle kick messages
      if (errorMsg.includes('You have been kicked from the room')) {
        logClient({ level: 'warn', domain: 'room', event: 'kick_error', message: 'User has been kicked' });
        onUserKickedRef.current?.();
        return;
      }

      // For other errors, only show if not already in room
      if (room && currentUser) {
        logDebug('room', 'error_ignore', 'Ignoring room error - already in room');
        return;
      }

      setError(errorMsg);
      setIsJoining(false);
      hasAttemptedJoinRef.current = false;
    };

    const handleSocketError = ({ error: errorMsg }: { error: string }) => {
      // Check if this is a passcode-related error
      if (errorMsg.toLowerCase().includes('passcode') || errorMsg.toLowerCase().includes('incorrect')) {
        onPasscodeErrorRef.current?.(errorMsg);
      } else if (!errorMsg.toLowerCase().includes('video')) {
        // Non-video errors go to sync error (video errors handled by video sync)
        setSyncError(errorMsg);
        setTimeout(() => setSyncError(''), 5000);
      }
    };

    const handlePasscodeRequired = ({ roomId: reqRoomId }: { roomId: string }) => {
      logClient({
        level: 'info',
        domain: 'room',
        event: 'passcode_required',
        message: `Passcode required for room ${reqRoomId}`,
      });
      setIsJoining(false);
      onPasscodeRequiredRef.current?.();
    };

    const handleRoomSettingsUpdated = ({ settings }: { settings: RoomSettings }) => {
      logDebug('room', 'settings_updated', 'Room settings updated', { settings });
      setRoom(prev => (prev ? { ...prev, settings } : null));
      onRoomSettingsUpdatedRef.current?.(settings);
    };

    socket.on('room-joined', handleRoomJoined);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('user-promoted', handleUserPromoted);
    socket.on('user-kicked', handleUserKicked);
    socket.on('video-set', handleVideoSet);
    socket.on('room-error', handleRoomError);
    socket.on('error', handleSocketError);
    socket.on('passcode-required', handlePasscodeRequired);
    socket.on('room-settings-updated', handleRoomSettingsUpdated);

    return () => {
      socket.off('room-joined', handleRoomJoined);
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('user-promoted', handleUserPromoted);
      socket.off('user-kicked', handleUserKicked);
      socket.off('video-set', handleVideoSet);
      socket.off('room-error', handleRoomError);
      socket.off('error', handleSocketError);
      socket.off('passcode-required', handlePasscodeRequired);
      socket.off('room-settings-updated', handleRoomSettingsUpdated);
    };
  }, [socket, isConnected, room, currentUser]);

  // Update cleanup data ref
  useEffect(() => {
    cleanupDataRef.current = {
      socket,
      isConnected,
      roomId,
      room,
      currentUser,
    };
  }, [socket, isConnected, roomId, room, currentUser]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const { socket: s, isConnected: c, roomId: r, room: rm, currentUser: u } = cleanupDataRef.current;
      if (s && c && rm && u) {
        logClient({
          level: 'info',
          domain: 'room',
          event: 'unmount_leave',
          message: 'Component unmounting, leaving room',
        });
        s.emit('leave-room', { roomId: r });
      }
    };
  }, []);

  // Actions
  const handlePromoteUser = useCallback(
    (userId: string) => {
      if (!socket || !currentUser?.isHost) return;
      socket.emit('promote-host', { roomId, userId });
    },
    [socket, currentUser?.isHost, roomId]
  );

  const handleKickUser = useCallback(
    (userId: string) => {
      if (!socket || !currentUser?.isHost) return;

      const targetUser = room?.users.find(u => u.id === userId);
      if (targetUser) {
        socket.emit('kick-user', { roomId, userId });
      }
    },
    [socket, currentUser?.isHost, roomId, room?.users]
  );

  const handleUpdateRoomSettings = useCallback(
    (settings: Partial<RoomSettings>) => {
      if (!socket || !currentUser?.isHost) return;

      logDebug('room', 'settings_update', 'Updating room settings', { settings });
      socket.emit('update-room-settings', { roomId, settings });
    },
    [socket, currentUser?.isHost, roomId]
  );

  const emitJoinRoom = useCallback(
    (userName: string, passcode?: string, hostToken?: string) => {
      if (!socket) return;
      if (passcode) {
        socket.emit('verify-passcode', { roomId, userName, passcode });
      } else if (hostToken) {
        socket.emit('join-room', { roomId, userName, hostToken });
      } else {
        socket.emit('join-room', { roomId, userName });
      }
    },
    [socket, roomId]
  );

  const emitLeaveRoom = useCallback(() => {
    if (!socket) return;
    socket.emit('leave-room', { roomId });
  }, [socket, roomId]);

  // Callback registration functions
  const onRoomJoined = useCallback((callback: (data: { room: Room; user: User }) => void) => {
    onRoomJoinedRef.current = callback;
  }, []);

  const onVideoSet = useCallback((callback: (data: VideoSetResponse) => void) => {
    onVideoSetRef.current = callback;
  }, []);

  const onUserLeft = useCallback((callback: (userId: string) => void) => {
    onUserLeftRef.current = callback;
  }, []);

  const onPasscodeRequired = useCallback((callback: () => void) => {
    onPasscodeRequiredRef.current = callback;
  }, []);

  const onPasscodeError = useCallback((callback: (error: string) => void) => {
    onPasscodeErrorRef.current = callback;
  }, []);

  const onRoomClosed = useCallback((callback: () => void) => {
    onRoomClosedRef.current = callback;
  }, []);

  const onUserKicked = useCallback((callback: () => void) => {
    onUserKickedRef.current = callback;
  }, []);

  const onRoomSettingsUpdated = useCallback((callback: (settings: RoomSettings) => void) => {
    onRoomSettingsUpdatedRef.current = callback;
  }, []);

  return {
    // State
    room,
    currentUser,
    error,
    syncError,
    isJoining,

    // Refs
    hasAttemptedJoinRef,
    cleanupDataRef,

    // State Setters
    setRoom,
    setCurrentUser,
    setError,
    setSyncError,
    setIsJoining,

    // Actions
    handlePromoteUser,
    handleKickUser,
    handleUpdateRoomSettings,
    emitJoinRoom,
    emitLeaveRoom,

    // Callbacks
    onRoomJoined,
    onVideoSet,
    onUserLeft,
    onPasscodeRequired,
    onPasscodeError,
    onRoomClosed,
    onUserKicked,
    onRoomSettingsUpdated,
  };
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/use-socket';
import { Room, User, ChatMessage, TypingUser } from '@/types';
import { toast } from 'sonner';
import { roomSessionStorage } from '@/lib/session-storage';

type ClientVideoMeta = {
  originalUrl: string;
  playbackUrl: string;
  deliveryType: 'youtube' | 'file-direct' | 'file-proxy' | 'hls';
  videoType: 'youtube' | 'mp4' | 'm3u8' | null;
  containerHint?: string;
  codecWarning?: string;
  requiresProxy: boolean;
  decisionReasons: string[];
  probe: { status: number; contentType?: string; acceptRanges?: boolean };
  timestamp: number;
};

interface UseRoomOptions {
  roomId: string;
}

interface UseRoomReturn {
  // State
  room: Room | null;
  currentUser: User | null;
  messages: ChatMessage[];
  typingUsers: TypingUser[];
  error: string;
  syncError: string;
  isJoining: boolean;
  showGuestInfoBanner: boolean;
  showHostDialog: boolean;
  showCopied: boolean;

  // Actions
  setShowGuestInfoBanner: (show: boolean) => void;
  setShowHostDialog: (show: boolean) => void;
  setShowCopied: (show: boolean) => void;
  handlePromoteUser: (userId: string) => void;
  handleKickUser: (userId: string) => void;
  handleSendMessage: (
    message: string,
    replyTo?: { messageId: string; userId: string; userName: string; message: string }
  ) => void;
  handleTypingStart: () => void;
  handleTypingStop: () => void;
  handleToggleReaction: (messageId: string, emoji: string) => void;
  markMessagesAsRead: () => void;
  copyRoomId: () => void;
  shareRoom: () => void;
}

export function useRoom({ roomId }: UseRoomOptions): UseRoomReturn {
  const router = useRouter();
  const { socket, isConnected } = useSocket();

  const [room, setRoom] = useState<Room | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [showGuestInfoBanner, setShowGuestInfoBanner] = useState(false);
  const [showHostDialog, setShowHostDialog] = useState(false);
  const [showCopied, setShowCopied] = useState(false);
  const [lastJoinAttempt, setLastJoinAttempt] = useState<number>(0);

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

  // Socket event handlers
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleRoomJoined = ({ room: joinedRoom, user }: { room: Room; user: User }) => {
      console.log('✅ Room joined successfully:', {
        room: joinedRoom.id,
        user: user.name,
        isHost: user.isHost,
      });
      setRoom(joinedRoom);
      setCurrentUser(user);
      setError('');
      setIsJoining(false);
      hasAttemptedJoinRef.current = false;

      // Show info banner for guests when joining a room with video
      if (!user.isHost && joinedRoom.videoUrl) {
        setShowGuestInfoBanner(true);
        setTimeout(() => setShowGuestInfoBanner(false), 5000);
      }
    };

    const handleUserJoined = ({ user }: { user: User }) => {
      setRoom(prev => {
        if (!prev) return null;
        const existingUserIndex = prev.users.findIndex(u => u.id === user.id);
        if (existingUserIndex >= 0) {
          console.log('🔄 User already exists, updating:', user.name);
          const updatedUsers = [...prev.users];
          updatedUsers[existingUserIndex] = user;
          return { ...prev, users: updatedUsers };
        }
        console.log('👋 New user joined:', user.name);
        return { ...prev, users: [...prev.users, user] };
      });
    };

    const handleUserLeft = ({ userId }: { userId: string }) => {
      setTypingUsers(prev => prev.filter(user => user.userId !== userId));
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
          console.log('🎉 You have been promoted to host!');
          return { ...prev, isHost: true };
        }
        return prev;
      });

      console.log(`👑 ${userName} has been promoted to host`);
    };

    const handleUserKicked = ({
      userId,
      userName,
      kickedBy,
    }: {
      userId: string;
      userName: string;
      kickedBy?: string;
    }) => {
      setRoom(prev => {
        if (!prev) return null;

        const userExists = prev.users.some(u => u.id === userId);
        if (!userExists) return prev;

        const updatedUsers = prev.users.filter(u => u.id !== userId);
        return {
          ...prev,
          users: [...updatedUsers],
        };
      });
    };

    const handleVideoSet = ({
      videoUrl,
      videoType,
      videoMeta,
    }: {
      videoUrl: string;
      videoType: 'youtube' | 'mp4' | 'm3u8';
      videoMeta?: unknown;
    }) => {
      setRoom(prev =>
        prev
          ? {
              ...prev,
              videoUrl,
              videoType,
              videoMeta:
                (videoMeta as ClientVideoMeta | undefined) ||
                (prev as unknown as { videoMeta?: ClientVideoMeta }).videoMeta,
              videoState: {
                isPlaying: false,
                currentTime: 0,
                duration: 0,
                lastUpdateTime: Date.now(),
              },
            }
          : null
      );

      if (currentUser && !currentUser.isHost) {
        setShowGuestInfoBanner(true);
        setTimeout(() => setShowGuestInfoBanner(false), 5000);
      }
    };

    const handleNewMessage = ({ message }: { message: ChatMessage }) => {
      // Mark messages as read if they're from the current user, unread otherwise
      const messageWithReadStatus = {
        ...message,
        isRead: message.userId === currentUser?.id || false,
      };
      setMessages(prev => [...prev, messageWithReadStatus]);
    };

    const handleUserTyping = ({ userId, userName }: { userId: string; userName: string }) => {
      if (userId === currentUser?.id) return;

      setTypingUsers(prev => {
        const existing = prev.find(user => user.userId === userId);
        if (existing) {
          return prev.map(user => (user.userId === userId ? { ...user, timestamp: Date.now() } : user));
        }
        return [...prev, { userId, userName, timestamp: Date.now() }];
      });
    };

    const handleUserStoppedTyping = ({ userId }: { userId: string }) => {
      setTypingUsers(prev => prev.filter(user => user.userId !== userId));
    };

    const handleReactionUpdated = ({
      messageId,
      reactions,
    }: {
      messageId: string;
      reactions: Record<string, string[]>;
    }) => {
      setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, reactions } : m)));
    };

    const handleRoomError = ({ error }: { error: string }) => {
      console.error('🚨 Room error:', error);

      // Handle room closure (all hosts left)
      if (
        error.includes('All hosts have left') ||
        error.includes('Redirecting to home page') ||
        error.includes('closing room') ||
        error.includes('sending you back home')
      ) {
        console.log('🚪 Room closed by host departure, redirecting to home...');

        if (hasShownClosureToastRef.current) {
          console.log('🛡️ Closure toast already shown, skipping duplicate');
          return;
        }
        hasShownClosureToastRef.current = true;

        toast.error(`Party's Over!`, {
          description: `Looks like all the hosts have left, so this room is closing. We're sending you back home.`,
          duration: 4000,
        });

        setTimeout(() => {
          router.push('/');
        }, 1500);
        return;
      }

      // Handle kick messages - should always redirect regardless of room state
      if (error.includes('You have been kicked from the room')) {
        console.log('🚪 User has been kicked, redirecting to home...');

        toast.error('Kicked from Room', {
          description: error,
          duration: 4000,
        });

        setTimeout(() => {
          router.push('/');
        }, 1500);
        return;
      }

      // For other errors, only show if not already in room
      if (room && currentUser) {
        console.log('🛡️ Ignoring room error - already successfully in room');
        return;
      }

      setError(error);
      setIsJoining(false);
      hasAttemptedJoinRef.current = false;
      setLastJoinAttempt(0);
    };

    const handleSocketError = ({ error }: { error: string }) => {
      // Check if this is a video-related error
      if (error.toLowerCase().includes('video')) {
        toast.error('Video Error', {
          description: error,
        });
      } else {
        setSyncError(error);
        setTimeout(() => setSyncError(''), 5000);
      }
    };

    socket.on('room-joined', handleRoomJoined);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('user-promoted', handleUserPromoted);
    socket.on('user-kicked', handleUserKicked);
    socket.on('video-set', handleVideoSet);
    socket.on('new-message', handleNewMessage);
    socket.on('user-typing', handleUserTyping);
    socket.on('user-stopped-typing', handleUserStoppedTyping);
    socket.on('reaction-updated', handleReactionUpdated);
    socket.on('room-error', handleRoomError);
    socket.on('error', handleSocketError);

    return () => {
      socket.off('room-joined', handleRoomJoined);
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('user-promoted', handleUserPromoted);
      socket.off('user-kicked', handleUserKicked);
      socket.off('video-set', handleVideoSet);
      socket.off('new-message', handleNewMessage);
      socket.off('user-typing', handleUserTyping);
      socket.off('user-stopped-typing', handleUserStoppedTyping);
      socket.off('reaction-updated', handleReactionUpdated);
      socket.off('room-error', handleRoomError);
      socket.off('error', handleSocketError);
    };
  }, [socket, isConnected, router, currentUser, room]);

  // Join room logic
  useEffect(() => {
    if (!socket || !isConnected || !roomId) {
      console.log('🚫 Not ready to join:', { socket: !!socket, isConnected, roomId });
      return;
    }

    if (room && currentUser) {
      console.log('🔄 Already in room, skipping join');
      return;
    }

    if (isJoining || hasAttemptedJoinRef.current) {
      console.log('⏳ Join already in progress or attempted, skipping');
      return;
    }

    if ((socket as unknown as { rooms?: Set<string> }).rooms?.has(roomId)) {
      console.log('🏠 Socket already in room, skipping join');
      hasAttemptedJoinRef.current = true;
      return;
    }

    const now = Date.now();
    if (now - lastJoinAttempt < 2000) {
      console.log('🕒 Too soon since last join attempt, skipping');
      return;
    }

    console.log('🚀 Starting room join process...');
    setIsJoining(true);
    setLastJoinAttempt(now);
    hasAttemptedJoinRef.current = true;

    // Check if this user is the room creator first
    const creatorData = roomSessionStorage.getRoomCreator(roomId);
    if (creatorData) {
      console.log('👑 Room creator detected, joining as host:', creatorData.hostName);
      roomSessionStorage.clearRoomCreator();
      socket.emit('join-room', {
        roomId,
        userName: creatorData.hostName,
        hostToken: creatorData.hostToken,
      });
      return;
    }

    // Check if user came from join page
    const joinData = roomSessionStorage.getJoinData(roomId);
    if (joinData) {
      roomSessionStorage.clearJoinData();
      console.log('👤 Joining with stored data:', joinData.userName);
      socket.emit('join-room', { roomId, userName: joinData.userName });
      return;
    }

    // Prompt for name if no stored data
    console.log('❓ No stored user data, prompting for name');
    const userName = prompt(`What's your callname?`);
    if (!userName || !userName.trim()) {
      console.log('❌ No name provided, redirecting to join page');
      setIsJoining(false);
      hasAttemptedJoinRef.current = false;
      router.push('/join');
      return;
    }

    const trimmedName = userName.trim();
    if (trimmedName.length < 2) {
      alert("Hmm, that name's a little brief. We need a callsign that's at least 2 characters long.");
      setIsJoining(false);
      hasAttemptedJoinRef.current = false;
      router.push('/join');
      return;
    }

    if (trimmedName.length > 20) {
      alert('Whoa, what an epic name! Sadly, our little callsign tags can only fit 20 characters.');
      setIsJoining(false);
      hasAttemptedJoinRef.current = false;
      router.push('/join');
      return;
    }

    if (!/^[a-zA-Z0-9\s\-_.!?]+$/.test(trimmedName)) {
      alert('Easy on the fancy characters! Our system is a bit sensitive with those special characters.');
      setIsJoining(false);
      hasAttemptedJoinRef.current = false;
      router.push('/join');
      return;
    }

    console.log('📝 Joining room with prompted name:', trimmedName);
    socket.emit('join-room', { roomId, userName: trimmedName });
  }, [socket, isConnected, roomId, router, room, currentUser, isJoining, lastJoinAttempt]);

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
      const { socket, isConnected, roomId, room, currentUser } = cleanupDataRef.current;
      if (socket && isConnected && room && currentUser) {
        console.log('🚪 Component unmounting, leaving room...');
        socket.emit('leave-room', { roomId });
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

  const handleSendMessage = useCallback(
    (message: string, replyTo?: { messageId: string; userId: string; userName: string; message: string }) => {
      if (!socket) return;
      socket.emit('send-message', { roomId, message, replyTo });
    },
    [socket, roomId]
  );

  const handleTypingStart = useCallback(() => {
    if (!socket) return;
    socket.emit('typing-start', { roomId });
  }, [socket, roomId]);

  const handleTypingStop = useCallback(() => {
    if (!socket) return;
    socket.emit('typing-stop', { roomId });
  }, [socket, roomId]);

  const handleToggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      if (!socket) return;
      socket.emit('toggle-reaction', { roomId, messageId, emoji });
    },
    [socket, roomId]
  );

  const copyRoomId = useCallback(() => {
    navigator.clipboard.writeText(roomId);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  }, [roomId]);

  const shareRoom = useCallback(() => {
    const url = `${window.location.origin}/room/${roomId}`;
    if (navigator.share) {
      navigator.share({
        title: `You're invited! Yay?`,
        text: `Come watch this with me ;) Here's the room code: ${roomId}`,
        url,
      });
    } else {
      navigator.clipboard.writeText(url);
    }
  }, [roomId]);

  const markMessagesAsRead = useCallback(() => {
    setMessages(prev => prev.map(message => ({ ...message, isRead: true })));
  }, []);

  return {
    // State
    room,
    currentUser,
    messages,
    typingUsers,
    error,
    syncError,
    isJoining,
    showGuestInfoBanner,
    showHostDialog,
    showCopied,

    // Actions
    setShowGuestInfoBanner,
    setShowHostDialog,
    setShowCopied,
    handlePromoteUser,
    handleKickUser,
    handleSendMessage,
    handleTypingStart,
    handleTypingStop,
    handleToggleReaction,
    markMessagesAsRead,
    copyRoomId,
    shareRoom,
  };
}

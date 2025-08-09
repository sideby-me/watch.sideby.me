'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '@/hooks/use-socket';
import { VoiceUserUpdate } from '@/types';
import { toast } from 'sonner';

interface PeerConnection {
  userId: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
}

interface UseVoiceChatOptions {
  roomId: string;
  userId: string;
  isHost: boolean;
  initialVoiceUsers?: VoiceUserUpdate[];
}

interface UseVoiceChatReturn {
  // State
  isVoiceEnabled: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isConnecting: boolean;
  voiceUsers: VoiceUserUpdate[];
  needsAudioUnlock: boolean;

  // Actions
  toggleVoiceChat: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  unlockAudio: () => void;

  // Voice levels (for future use)
  getVoiceLevel: (userId: string) => number;
} // Google's public STUN servers for NAT traversal
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

export function useVoiceChat({
  roomId,
  userId,
  isHost,
  initialVoiceUsers = [],
}: UseVoiceChatOptions): UseVoiceChatReturn {
  const { socket } = useSocket();

  // State
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [voiceUsers, setVoiceUsers] = useState<VoiceUserUpdate[]>([]);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);

  // Refs for WebRTC management
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, PeerConnection>>(new Map());
  const voiceLevelsRef = useRef<Map<string, number>>(new Map());
  const hasSeededInitialVoiceUsersRef = useRef<boolean>(false);

  // Reset seed flag when room changes
  useEffect(() => {
    hasSeededInitialVoiceUsersRef.current = false;
  }, [roomId]);

  // Seed initial voice users from room state (for fresh joiners), only once per room
  useEffect(() => {
    if (hasSeededInitialVoiceUsersRef.current) return;
    if (!initialVoiceUsers || initialVoiceUsers.length === 0) return;

    setVoiceUsers(prev => {
      const userIdToUpdate: Map<string, VoiceUserUpdate> = new Map();
      prev.forEach(u => userIdToUpdate.set(u.userId, u));
      initialVoiceUsers.forEach(u => userIdToUpdate.set(u.userId, u));
      return Array.from(userIdToUpdate.values());
    });

    hasSeededInitialVoiceUsersRef.current = true;
  }, [initialVoiceUsers, roomId]);

  // Get user's microphone stream
  const getUserMedia = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000, // Optimal for voice
        },
        video: false,
      });

      console.log('🎤 Got user media stream');
      return stream;
    } catch (error) {
      console.error('❌ Failed to get user media:', error);
      toast.error('Failed to access microphone. Please check permissions.');
      return null;
    }
  }, []);

  // Create peer connection for a specific user
  const createPeerConnection = useCallback(
    (targetUserId: string): RTCPeerConnection => {
      const peerConnection = new RTCPeerConnection(ICE_SERVERS);

      // Handle ICE candidates
      peerConnection.onicecandidate = event => {
        if (event.candidate && socket) {
          socket.emit('webrtc-signaling', {
            roomId,
            targetUserId,
            type: 'ice-candidate',
            data: event.candidate,
          });
        }
      };

      // Handle incoming audio stream
      peerConnection.ontrack = event => {
        console.log('🔊 Received remote audio stream from:', targetUserId);
        const [remoteStream] = event.streams;

        // Create audio element to play remote stream
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.autoplay = true;
        (audio as any).playsInline = true; // Important for mobile

        // Store stream and audio element reference
        const existingPeer = peerConnectionsRef.current.get(targetUserId);
        if (existingPeer) {
          existingPeer.stream = remoteStream;
          (existingPeer as any).audioElement = audio; // Store audio element for cleanup
        }

        // Play the audio
        audio.play().catch(error => {
          console.error('❌ Failed to play remote audio:', error);
          // Try again after user interaction if autoplay is blocked
          if (error.name === 'NotAllowedError') {
            console.log('🔇 Autoplay blocked - audio will play after user interaction');
            setNeedsAudioUnlock(true);
          }
        });
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log(`🔗 Connection state with ${targetUserId}:`, peerConnection.connectionState);

        if (peerConnection.connectionState === 'connected') {
          console.log(`✅ Successfully connected to ${targetUserId}`);
        } else if (peerConnection.connectionState === 'failed') {
          console.error('❌ Connection failed with:', targetUserId);
          closePeerConnection(targetUserId);
        }
      };

      // Add ICE connection state change handler for better debugging
      peerConnection.oniceconnectionstatechange = () => {
        console.log(`🧊 ICE connection state with ${targetUserId}:`, peerConnection.iceConnectionState);
      };
      return peerConnection;
    },
    [socket, roomId]
  );

  // Close peer connection
  const closePeerConnection = useCallback((targetUserId: string) => {
    const peer = peerConnectionsRef.current.get(targetUserId);
    if (peer) {
      peer.connection.close();
      if (peer.stream) {
        peer.stream.getTracks().forEach(track => track.stop());
      }
      // Clean up audio element
      const audioElement = (peer as any).audioElement;
      if (audioElement) {
        audioElement.pause();
        audioElement.srcObject = null;
      }
      peerConnectionsRef.current.delete(targetUserId);
      voiceLevelsRef.current.delete(targetUserId);
    }
  }, []);

  // Create and send offer to target user
  const createOffer = useCallback(
    async (targetUserId: string) => {
      if (!localStreamRef.current || !socket) return;

      const peerConnection = createPeerConnection(targetUserId);

      // Add local stream to peer connection
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current!);
      });

      try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit('webrtc-signaling', {
          roomId,
          targetUserId,
          type: 'offer',
          data: offer,
        });

        peerConnectionsRef.current.set(targetUserId, {
          userId: targetUserId,
          connection: peerConnection,
        });

        console.log('📤 Sent offer to:', targetUserId);
      } catch (error) {
        console.error('❌ Failed to create offer:', error);
        peerConnection.close();
      }
    },
    [socket, roomId, createPeerConnection]
  );

  // Handle incoming offer
  const handleOffer = useCallback(
    async (fromUserId: string, offer: RTCSessionDescriptionInit) => {
      if (!localStreamRef.current || !socket) return;

      const peerConnection = createPeerConnection(fromUserId);

      // Add local stream to peer connection
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current!);
      });

      try {
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('webrtc-signaling', {
          roomId,
          targetUserId: fromUserId,
          type: 'answer',
          data: answer,
        });

        peerConnectionsRef.current.set(fromUserId, {
          userId: fromUserId,
          connection: peerConnection,
        });

        console.log('📤 Sent answer to:', fromUserId);
      } catch (error) {
        console.error('❌ Failed to handle offer:', error);
        peerConnection.close();
      }
    },
    [socket, roomId, createPeerConnection]
  );

  // Handle incoming answer
  const handleAnswer = useCallback(async (fromUserId: string, answer: RTCSessionDescriptionInit) => {
    const peer = peerConnectionsRef.current.get(fromUserId);
    if (!peer) return;

    try {
      await peer.connection.setRemoteDescription(answer);
      console.log('✅ Set remote description for:', fromUserId);
    } catch (error) {
      console.error('❌ Failed to handle answer:', error);
    }
  }, []);

  // Handle incoming ICE candidate
  const handleIceCandidate = useCallback(async (fromUserId: string, candidate: RTCIceCandidateInit) => {
    const peer = peerConnectionsRef.current.get(fromUserId);
    if (!peer) return;

    try {
      await peer.connection.addIceCandidate(candidate);
      console.log('🧊 Added ICE candidate from:', fromUserId);
    } catch (error) {
      console.error('❌ Failed to add ICE candidate:', error);
    }
  }, []);

  // Toggle voice chat on/off
  const toggleVoiceChat = useCallback(async () => {
    if (!socket) return;

    setIsConnecting(true);

    try {
      if (!isVoiceEnabled) {
        // Enable voice chat
        const stream = await getUserMedia();
        if (!stream) {
          setIsConnecting(false);
          return;
        }

        localStreamRef.current = stream;
        setIsVoiceEnabled(true);

        // Notify server
        socket.emit('voice-chat-toggle', {
          roomId,
          enabled: true,
        });

        console.log('🎤 Voice chat enabled');
      } else {
        // Disable voice chat
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop());
          localStreamRef.current = null;
        }

        // Close all peer connections
        peerConnectionsRef.current.forEach((_, targetUserId) => {
          closePeerConnection(targetUserId);
        });
        peerConnectionsRef.current.clear();

        setIsVoiceEnabled(false);
        setIsMuted(false);
        setIsDeafened(false);

        // Notify server
        socket.emit('voice-chat-toggle', {
          roomId,
          enabled: false,
        });

        console.log('🔇 Voice chat disabled');
      }
    } finally {
      setIsConnecting(false);
    }
  }, [socket, roomId, isVoiceEnabled, getUserMedia, closePeerConnection]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current || !socket) return;

    const newMutedState = !isMuted;
    setIsMuted(newMutedState);

    // Mute/unmute local audio tracks
    localStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = !newMutedState;
    });

    socket.emit('voice-control', {
      roomId,
      action: newMutedState ? 'mute' : 'unmute',
    });

    console.log(newMutedState ? '🤫 Muted' : '🎤 Unmuted');
  }, [socket, roomId, isMuted]);

  // Toggle deafen
  const toggleDeafen = useCallback(() => {
    if (!socket) return;

    const newDeafenedState = !isDeafened;
    setIsDeafened(newDeafenedState);

    // Mute/unmute all remote audio elements
    peerConnectionsRef.current.forEach(peer => {
      if (peer.stream) {
        peer.stream.getAudioTracks().forEach(track => {
          track.enabled = !newDeafenedState;
        });
      }
    });

    socket.emit('voice-control', {
      roomId,
      action: newDeafenedState ? 'deafen' : 'undeafen',
    });

    console.log(newDeafenedState ? '🔇 Deafened' : '🔊 Undeafened');
  }, [socket, roomId, isDeafened]);

  // Get voice level for user (placeholder for future implementation)
  const getVoiceLevel = useCallback((targetUserId: string): number => {
    return voiceLevelsRef.current.get(targetUserId) || 0;
  }, []);

  // Unlock audio for autoplay restrictions
  const unlockAudio = useCallback(async () => {
    try {
      // Create a minimal audio context to unlock audio
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      await audioContext.resume();
      audioContext.close();

      setNeedsAudioUnlock(false);
      console.log('🔓 Audio unlocked successfully');
    } catch (error) {
      console.error('❌ Failed to unlock audio:', error);
    }
  }, []);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const handleWebRTCSignaling = ({
      targetUserId,
      type,
      data,
    }: {
      targetUserId: string;
      type: 'offer' | 'answer' | 'ice-candidate';
      data: any;
    }) => {
      // targetUserId is actually the sender's ID (from server perspective)
      const fromUserId = targetUserId;

      console.log(`📡 Received ${type} from ${fromUserId}`);

      switch (type) {
        case 'offer':
          handleOffer(fromUserId, data);
          break;
        case 'answer':
          handleAnswer(fromUserId, data);
          break;
        case 'ice-candidate':
          handleIceCandidate(fromUserId, data);
          break;
      }
    };

    const handleVoiceUserUpdate = (update: VoiceUserUpdate) => {
      setVoiceUsers(prev => {
        const existing = prev.find(u => u.userId === update.userId);
        if (existing) {
          return prev.map(u => (u.userId === update.userId ? update : u));
        }
        return [...prev, update];
      });

      // If user just enabled voice, create peer connection
      if (update.voiceEnabled && update.userId !== userId && isVoiceEnabled) {
        setTimeout(() => createOffer(update.userId), 1000); // Small delay for stability
      }

      // If user disabled voice, close connection
      if (!update.voiceEnabled && update.userId !== userId) {
        closePeerConnection(update.userId);
      }
    };

    const handleUserLeft = ({ userId: leftUserId }: { userId: string }) => {
      // Remove from voice list and close connection
      setVoiceUsers(prev => prev.filter(u => u.userId !== leftUserId));
      if (leftUserId !== userId) {
        closePeerConnection(leftUserId);
      }
    };

    socket.on('webrtc-signaling', handleWebRTCSignaling);
    socket.on('voice-user-update', handleVoiceUserUpdate);
    socket.on('user-left', handleUserLeft);

    return () => {
      socket.off('webrtc-signaling', handleWebRTCSignaling);
      socket.off('voice-user-update', handleVoiceUserUpdate);
      socket.off('user-left', handleUserLeft);
    };
  }, [socket, userId, isVoiceEnabled, handleOffer, handleAnswer, handleIceCandidate, createOffer, closePeerConnection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      peerConnectionsRef.current.forEach((_, targetUserId) => {
        closePeerConnection(targetUserId);
      });
    };
  }, [closePeerConnection]);

  return {
    isVoiceEnabled,
    isMuted,
    isDeafened,
    isConnecting,
    voiceUsers,
    needsAudioUnlock,
    toggleVoiceChat,
    toggleMute,
    toggleDeafen,
    unlockAudio,
    getVoiceLevel,
  };
}

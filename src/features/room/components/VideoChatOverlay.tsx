'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { RemoteVideoStream } from '@/src/features/media/videochat';
import { User } from '@/types';
import { cn } from '@/src/lib/utils';
import { X, Video, VideoOff, GripVertical, Minimize2, Maximize2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface VideoChatOverlayProps {
  isVisible: boolean;
  localStream: MediaStream | null;
  remoteStreams: RemoteVideoStream[];
  currentUserId: string;
  isCameraOff: boolean;
  users?: User[];
  onClose?: () => void;
  portalContainer?: HTMLElement | null;
}

// Helper to derive initials
const initialsFromName = (name?: string) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase();

export const VideoChatOverlay: React.FC<VideoChatOverlayProps> = ({
  isVisible,
  localStream,
  remoteStreams,
  currentUserId,
  isCameraOff,
  users = [],
  onClose,
  portalContainer,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);

  // Set initial position (bottom-right) after mount & on resize if it would overflow
  useEffect(() => {
    const place = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.offsetWidth || 320;
      const h = containerRef.current.offsetHeight || 200;
      const x = window.innerWidth - w - 24; // 24px margin
      const y = window.innerHeight - h - 24;
      setPosition(prev => (prev.x === 0 && prev.y === 0 ? { x: Math.max(8, x), y: Math.max(8, y) } : prev));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    setIsDragging(true);
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const clampPosition = useCallback((x: number, y: number) => {
    if (!containerRef.current) return { x, y };
    const w = containerRef.current.offsetWidth;
    const h = containerRef.current.offsetHeight;
    const maxX = window.innerWidth - w - 4;
    const maxY = window.innerHeight - h - 4;
    return {
      x: Math.min(Math.max(4, x), Math.max(4, maxX)),
      y: Math.min(Math.max(4, y), Math.max(4, maxY)),
    };
  }, []);

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDragging) return;
    const next = clampPosition(e.clientX - dragOffsetRef.current.x, e.clientY - dragOffsetRef.current.y);
    setPosition(next);
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, handlePointerMove]);

  // Map for quick user lookup
  const userMap = useRef<Map<string, User>>(new Map());
  useEffect(() => {
    userMap.current = new Map(users.map(u => [u.id, u]));
  }, [users]);

  // Local video ref (mirrored)
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!isCameraOff && localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isCameraOff]);

  if (!isVisible) return null;

  const content = (
    <div
      ref={containerRef}
      className={cn(
        'fixed z-50 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-lg border border-border bg-background/80 shadow-lg backdrop-blur transition-colors',
        isDragging && 'cursor-grabbing'
      )}
      style={{ left: position.x, top: position.y }}
      data-videochat-overlay
    >
      {/* Drag handle / header */}
      <div
        onPointerDown={handlePointerDown}
        className={cn(
          'flex cursor-grab select-none items-center justify-between gap-2 border-b border-border bg-black/40 p-4 text-sm font-medium'
        )}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">Video Chat</span>
          <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">{remoteStreams.length + 1}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(m => !m)}
            className="rounded p-1 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
            aria-label={isMinimized ? 'Expand video chat' : 'Minimize video chat'}
          >
            {isMinimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded p-1 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
              aria-label="Close video chat overlay"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {!isMinimized && (
        <div className="flex-1 overflow-y-auto p-2">
          <div className="grid grid-cols-2 gap-2">
            {/* Local tile */}
            <OverlayVideoTile
              stream={localStream || undefined}
              userId={currentUserId}
              name={userMap.current.get(currentUserId)?.name || 'You'}
              isOff={
                isCameraOff ||
                !localStream ||
                !localStream.getVideoTracks().some(t => t.enabled && t.readyState === 'live')
              }
              local
              videoRef={localVideoRef}
            />
            {remoteStreams.map(r => {
              const track = r.stream.getVideoTracks()[0];
              const off = !track || track.muted || track.readyState !== 'live' || !track.enabled;
              const u = userMap.current.get(r.userId);
              return <OverlayVideoTile key={r.userId} stream={r.stream} userId={r.userId} name={u?.name} isOff={off} />;
            })}
          </div>
        </div>
      )}
    </div>
  );

  if (portalContainer) {
    return createPortal(content, portalContainer);
  }
  return content;
};

interface OverlayVideoTileProps {
  stream?: MediaStream;
  userId: string;
  name?: string;
  isOff: boolean;
  local?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}

const OverlayVideoTile: React.FC<OverlayVideoTileProps> = ({ stream, userId, name, isOff, local, videoRef }) => {
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const ref = videoRef || internalRef;
  useEffect(() => {
    if (!isOff && ref.current && stream && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream, isOff, ref]);
  const initials = initialsFromName(name) || '??';
  return (
    <div
      className={cn(
        'group relative aspect-video w-full overflow-hidden rounded-sm border border-border bg-primary-50',
        'shadow-sm'
      )}
    >
      {!isOff && stream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={local}
          className={cn('h-full w-full object-cover', local && 'scale-x-[-1]')}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted/40">
          <Avatar size="sm">
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1 py-[2px] text-[9px] leading-none text-white">
        {isOff ? <VideoOff className="h-3 w-3" /> : <Video className="h-3 w-3" />}
        <span className="max-w-[60px] truncate">{local ? 'You' : name || userId.slice(0, 6)}</span>
      </div>
    </div>
  );
};

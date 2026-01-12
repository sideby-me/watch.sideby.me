'use client';
import React, { useEffect, useRef, useMemo } from 'react';
import { cn } from '@/src/lib/utils';
import { RemoteVideoStream } from '@/src/features/media/videochat';
import { User } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Video, VideoOff } from 'lucide-react';

interface VideoChatGridProps {
  localStream: MediaStream | null;
  remoteStreams: RemoteVideoStream[];
  currentUserId: string;
  isCameraOff: boolean;
  users?: User[];
  className?: string;
}

export const VideoChatGrid: React.FC<VideoChatGridProps> = ({
  localStream,
  remoteStreams,
  currentUserId,
  isCameraOff,
  className,
  users = [],
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  useEffect(() => {
    if (!isCameraOff && localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
      }
    }
  }, [localStream, isCameraOff]);

  return (
    <div className={cn('flex flex-wrap justify-center gap-2 rounded-md border border-border p-4', className)}>
      <VideoTile
        local
        stream={localStream || undefined}
        userId={currentUserId}
        isOff={
          isCameraOff || !localStream || !localStream.getVideoTracks().some(t => t.enabled && t.readyState === 'live')
        }
        name={userMap.get(currentUserId)?.name || 'You'}
        videoRef={localVideoRef}
      />
      {remoteStreams.map(r => {
        const track = r.stream.getVideoTracks()[0];
        const off = !track || track.muted || track.readyState !== 'live' || !track.enabled;
        const u = userMap.get(r.userId);
        return <VideoTile key={r.userId} stream={r.stream} userId={r.userId} name={u?.name} isOff={off} />;
      })}
    </div>
  );
};

interface VideoTileProps {
  stream?: MediaStream;
  userId: string;
  name?: string;
  isOff: boolean;
  local?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}

const initialsFromName = (name?: string) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase();

const VideoTile: React.FC<VideoTileProps> = ({ stream, userId, name, isOff, local, videoRef }) => {
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const ref = videoRef || internalRef;
  useEffect(() => {
    if (!isOff && ref.current && stream && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream, isOff, ref]);
  const initials = initialsFromName(name) || '??';
  return (
    <div
      className={cn(
        'group relative aspect-video w-full overflow-hidden rounded-md border border-border bg-primary-50 sm:w-1/3 md:w-1/2 lg:w-1/4'
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
        <div className="flex h-full w-full items-center justify-center">
          <Avatar size="lg">
            <AvatarFallback className="text-xs sm:text-sm">{initials}</AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-[10px] text-white">
        {isOff ? <VideoOff className="h-3 w-3" /> : <Video className="h-3 w-3" />}
        <span className="max-w-[70px] truncate">{local ? 'You' : name || userId.slice(0, 6)}</span>
      </div>
    </div>
  );
};

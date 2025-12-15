'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Volume2, VolumeX, Mic, MicOff, X, MinusIcon, Video, VideoOff } from 'lucide-react';
import { toast } from 'sonner';

interface VoiceConfig {
  isEnabled: boolean;
  isMuted: boolean;
  isConnecting: boolean;
  participantCount: number;
  overCap: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onToggleMute: () => void;
}

interface VideoConfig {
  isEnabled: boolean;
  isCameraOff: boolean;
  isConnecting: boolean;
  participantCount?: number;
  enable: () => Promise<void> | void;
  disable: () => Promise<void> | void;
  toggleCamera: () => void;
}

interface ChatHeaderProps {
  mode: 'sidebar' | 'overlay';
  messageCount?: number;
  unreadCount?: number;
  soundEnabled: boolean;
  onSoundToggle: () => void;
  voice?: VoiceConfig;
  video?: VideoConfig;
  onToggleMinimize?: () => void;
  onClose?: () => void;
}

export function ChatHeader({
  mode,
  messageCount = 0,
  unreadCount = 0,
  soundEnabled,
  onSoundToggle,
  voice,
  video,
  onToggleMinimize,
  onClose,
}: ChatHeaderProps) {
  const handleSoundToggle = () => {
    onSoundToggle();
    const newState = !soundEnabled;
    toast.success(
      newState
        ? "Message sounds on! You'll now hear that satisfying blip :)"
        : 'Message sounds off. Enjoy the peace and quiet.',
      {
        duration: 2000,
        position: 'bottom-right',
      }
    );
  };

  // Sidebar mode header
  if (mode === 'sidebar') {
    return (
      <div className="rounded-md border border-border p-4">
        <div className="flex items-center space-x-2">
          <MessageCircle className="h-6 w-6" />
          <span className="text-xl font-semibold tracking-tighter">Chat</span>
          <div className="flex w-full items-center justify-between space-x-2 pl-4">
            <div className="flex items-center gap-4">
              {soundEnabled ? (
                <Volume2 className="h-5 w-5 cursor-pointer" onClick={handleSoundToggle} />
              ) : (
                <VolumeX className="h-5 w-5 cursor-pointer" onClick={handleSoundToggle} />
              )}
              {(voice || video) && (
                <div className="flex items-center gap-1">
                  {voice && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      {voice.isEnabled ? (
                        voice.isMuted ? (
                          <MicOff className="h-2 w-2" />
                        ) : (
                          <Mic className="h-2 w-2" />
                        )
                      ) : (
                        <Volume2 className="h-2 w-2" />
                      )}
                      {voice.participantCount}
                    </Badge>
                  )}
                  {video && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      {video.isEnabled ? (
                        video.isCameraOff ? (
                          <VideoOff className="h-2 w-2" />
                        ) : (
                          <Video className="h-2 w-2" />
                        )
                      ) : (
                        <Video className="h-2 w-2" />
                      )}
                      {video.participantCount ?? 0}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <Badge>{messageCount}</Badge>
          </div>
        </div>
      </div>
    );
  }

  // Overlay mode header
  return (
    <div className="flex items-center justify-between border-b border-border p-3">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-4 w-4" />
        <span className="text-sm font-medium">Chat</span>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="text-xs">
            {unreadCount}
          </Badge>
        )}
        {(voice || video) && (
          <div className="flex items-center gap-1">
            {voice && (
              <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                {voice.isEnabled ? (
                  voice.isMuted ? (
                    <MicOff className="h-2 w-2" />
                  ) : (
                    <Mic className="h-2 w-2" />
                  )
                ) : (
                  <Volume2 className="h-2 w-2" />
                )}
                {voice.participantCount}
              </Badge>
            )}
            {video && (
              <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                {video.isEnabled ? (
                  video.isCameraOff ? (
                    <VideoOff className="h-2 w-2" />
                  ) : (
                    <Video className="h-2 w-2" />
                  )
                ) : (
                  <Video className="h-2 w-2" />
                )}
                {video.participantCount ?? 0}
              </Badge>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center">
        <Button variant="ghost" size="sm" onClick={handleSoundToggle} className="h-8 w-8 p-0">
          {soundEnabled ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
        </Button>
        {onToggleMinimize && (
          <Button variant="ghost" size="sm" onClick={onToggleMinimize} className="h-8 w-8 p-0">
            <MinusIcon className="h-3 w-3" />
          </Button>
        )}
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

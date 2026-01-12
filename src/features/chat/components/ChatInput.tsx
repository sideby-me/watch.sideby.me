'use client';

import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Mic, MicOff, Phone, Smile, X, Reply, Video, Camera, CameraOff } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmojiPicker, EmojiPickerSearch, EmojiPickerContent, EmojiPickerFooter } from '@/components/ui/emoji-picker';
import { useFullscreenPortalContainer } from '@/src/features/room/hooks';

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

interface ChatInputProps {
  inputMessage: string;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValueChange?: (value: string) => void; // programmatic changes (mentions, emoji, etc.)
  onSubmit: (e: React.FormEvent) => void;
  voice?: VoiceConfig;
  video?: {
    isEnabled: boolean;
    isCameraOff: boolean;
    isConnecting: boolean;
    enable: () => Promise<void> | void;
    disable: () => Promise<void> | void;
    toggleCamera: () => void;
  };
  mode?: 'sidebar' | 'overlay';
  onEmojiSelect?: (emoji: string) => void;
  replyTo?: {
    messageId: string;
    userName: string;
    message: string;
  } | null;
  onCancelReply?: () => void;
  users?: { id: string; name: string }[];
  currentUserId?: string;
}

export function ChatInput({
  inputMessage,
  onInputChange,
  onValueChange,
  onSubmit,
  voice,
  video,
  mode = 'sidebar',
  onEmojiSelect,
  replyTo,
  onCancelReply,
  users = [],
  currentUserId,
}: ChatInputProps) {
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggeredRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const ignoreNextCloseRef = useRef(false);
  const caretWasAtEndRef = useRef(true);
  const lastValueRef = useRef(inputMessage);
  // Mention state
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionAnchor, setMentionAnchor] = useState<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const prevMentionQueryRef = useRef<string>('');

  const filteredUsers = mentionActive
    ? users
        .filter(u => u.name.toLowerCase().includes(mentionQuery.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const portalContainer = useFullscreenPortalContainer();

  // When the external value changes, if caret was at end, keep scroll at end
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const prev = lastValueRef.current;
    lastValueRef.current = inputMessage;
    if (inputMessage.length >= prev.length && caretWasAtEndRef.current) {
      requestAnimationFrame(() => {
        try {
          el.selectionStart = el.selectionEnd = el.value.length;
          el.scrollLeft = el.scrollWidth;
        } catch {}
      });
    }
  }, [inputMessage]);

  // Voice button handlers
  const handleVoiceButtonMouseDown = () => {
    longPressTriggeredRef.current = false;
    if (!voice?.isEnabled) return; // Only start long-press timer when currently connected
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      // Mark as long-press, perform disconnect, keep flag true so the ensuing click is ignored
      longPressTriggeredRef.current = true;
      voice.onDisable();
      toast.success("Voice chat disconnected. It's quiet again!");
      // After the click event from this press has had a chance to fire
      setTimeout(() => {
        longPressTriggeredRef.current = false;
      }, 250);
    }, 600);
  };

  const handleVoiceButtonMouseUp = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  };

  const handleVoiceButtonClick = () => {
    if (!voice) return;
    if (longPressTriggeredRef.current) return;
    if (voice.isEnabled) {
      voice.onToggleMute();
    } else if (voice.overCap) {
      toast.error("Whoa, it's a full house! The voice channel is at its max of 5 people.");
    } else {
      voice.onEnable();
    }
  };

  const handleVoiceButtonContextMenu = (e: React.MouseEvent) => {
    if (!voice?.isEnabled) return;
    e.preventDefault();
    voice.onDisable();
    toast.success("Voice chat disconnected. It's quiet again!");
    longPressTriggeredRef.current = false;
  };

  // Video button handlers (mirrors voice logic)
  const videoLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoLongPressTriggeredRef = useRef(false);

  const handleVideoButtonMouseDown = () => {
    videoLongPressTriggeredRef.current = false;
    if (!video?.isEnabled) return; // Only enable long press to leave when already connected
    if (videoLongPressTimerRef.current) clearTimeout(videoLongPressTimerRef.current);
    videoLongPressTimerRef.current = setTimeout(() => {
      videoLongPressTriggeredRef.current = true;
      video.disable();
      toast.success(`You've left video chat. It's dark again.`);
      setTimeout(() => {
        videoLongPressTriggeredRef.current = false;
      }, 250);
    }, 600);
  };

  const handleVideoButtonMouseUp = () => {
    if (videoLongPressTimerRef.current) clearTimeout(videoLongPressTimerRef.current);
  };

  const handleVideoButtonClick = () => {
    if (!video) return;
    if (videoLongPressTriggeredRef.current) return;
    if (video.isEnabled) {
      video.toggleCamera();
    } else {
      video.enable();
    }
  };

  const handleVideoButtonContextMenu = (e: React.MouseEvent) => {
    if (!video?.isEnabled) return;
    e.preventDefault();
    video.disable();
    toast.success(`You've left video chat. It's dark again.`);
    videoLongPressTriggeredRef.current = false;
  };

  const insertMention = (user: { id: string; name: string }) => {
    const el = inputRef.current;
    if (!el) return;
    const anchor = mentionAnchor ?? 0;
    const caret = el.selectionStart ?? inputMessage.length;
    // Insert display form only; conversion to machine tokens happens on send
    const display = `@${user.name} `;
    const nextValue = (inputMessage.slice(0, anchor) + display + inputMessage.slice(caret)).slice(0, 500);
    onValueChange?.(nextValue);
    // Update caret after React updates value
    requestAnimationFrame(() => {
      if (!el) return;
      try {
        const pos = anchor + display.length;
        el.focus();
        el.selectionStart = el.selectionEnd = pos;
      } catch {}
    });
    setMentionActive(false);
    setMentionQuery('');
    setMentionAnchor(null);
  };

  const truncateMessage = (text: string, maxLength: number = 80) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  const inputSize = mode === 'overlay' ? 'h-8' : '';
  const buttonSize = mode === 'overlay' ? 'h-8 w-8' : '';
  const iconSize = mode === 'overlay' ? 'h-3 w-3' : 'h-4 w-4';
  const spacing = mode === 'overlay' ? 'gap-2' : 'space-x-2';

  return (
    <div className={`relative border-t border-border ${mode === 'overlay' ? 'border-border p-4' : 'mt-1 pt-8'}`}>
      {/* Reply preview */}
      {replyTo && (
        <div
          className="absolute bottom-full left-0 right-0 z-10 mb-1 flex items-center gap-2 rounded-t border border-b-0 border-muted bg-background/95 p-2 text-sm shadow-lg backdrop-blur-sm"
          style={{ marginLeft: mode === 'overlay' ? '1rem' : '0', marginRight: mode === 'overlay' ? '1rem' : '0' }}
        >
          <Reply className="h-4 w-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-muted-foreground">{replyTo.userName}</div>
            <div className="truncate text-xs text-muted-foreground">{truncateMessage(replyTo.message)}</div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            aria-label="Cancel reply"
            title="Cancel reply"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className={`flex ${spacing}`}>
        <div className="relative flex-1">
          <Input
            placeholder="Don't be shy..."
            value={inputMessage}
            onChange={onInputChange}
            className={`pr-9 ${inputSize} ${mode === 'overlay' ? 'text-sm' : ''}`}
            maxLength={500}
            ref={inputRef}
            onFocus={() => {
              const el = inputRef.current;
              if (!el) return;
              if (caretWasAtEndRef.current) {
                requestAnimationFrame(() => {
                  try {
                    el.selectionStart = el.selectionEnd = el.value.length;
                    el.scrollLeft = el.scrollWidth;
                  } catch {}
                });
              }
            }}
            onSelect={() => {
              const el = inputRef.current;
              if (!el) return;
              caretWasAtEndRef.current = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
            }}
            onClick={() => {
              const el = inputRef.current;
              if (!el) return;
              caretWasAtEndRef.current = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
            }}
            onKeyDown={e => {
              // Handle mention navigation
              if (mentionActive && filteredUsers.length > 0) {
                if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
                  e.preventDefault();
                  setMentionIndex(i => (i + 1) % filteredUsers.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionIndex(i => (i - 1 + filteredUsers.length) % filteredUsers.length);
                  return;
                }
                if (e.key === 'Enter') {
                  const user = filteredUsers[mentionIndex];
                  if (user) {
                    e.preventDefault();
                    insertMention(user);
                  }
                  return;
                }
                if (e.key === 'Escape') {
                  setMentionActive(false);
                  return;
                }
              }
            }}
            onKeyUp={e => {
              if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab'].includes(e.key)) return;
              // Detect mention trigger pattern
              const el = inputRef.current;
              if (!el) return;
              const caret = el.selectionStart ?? el.value.length;
              const value = el.value;
              // Find last '@' before caret
              const i = value.lastIndexOf('@', caret - 1);
              let active = false;
              if (i !== -1) {
                // Ensure it's start or preceded by space
                const prevChar = i === 0 ? ' ' : value[i - 1];
                if (/\s/.test(prevChar)) {
                  // Extract query until space or end
                  const after = value.slice(i + 1, caret);
                  if (!after.includes('@') && !after.includes(' ')) {
                    active = true;
                    // Only reset anchor / index if anchor changed (new mention) or query was cleared
                    if (mentionAnchor !== i) {
                      setMentionAnchor(i);
                      setMentionIndex(0);
                    }
                    setMentionQuery(after);
                  }
                }
              }
              if (!active) {
                setMentionActive(false);
                setMentionAnchor(null);
                setMentionQuery('');
              } else if (!mentionActive) {
                setMentionActive(true);
              } else {
                // Preserve index unless the query changed from previous
                if (prevMentionQueryRef.current !== mentionQuery) {
                  // keep index if still within range, if filter shrank, clamp
                  setMentionIndex(idx => {
                    const q = mentionQuery.toLowerCase();
                    const filtered = users.filter(u => u.name.toLowerCase().includes(q));
                    return Math.min(idx, Math.max(filtered.length - 1, 0));
                  });
                }
              }
              prevMentionQueryRef.current = mentionQuery;
            }}
          />
          {/* Mention suggestions */}
          {mentionActive && filteredUsers.length > 0 && (
            <div
              className="absolute bottom-full mb-1 max-h-60 w-44 overflow-y-auto rounded-md border border-border bg-background text-sm shadow-md"
              style={{ left: 0, zIndex: 40 }}
            >
              {filteredUsers.map((u, idx) => {
                const isSelf = u.id === currentUserId;
                const active = idx === mentionIndex;
                return (
                  <button
                    type="button"
                    key={u.id}
                    onMouseDown={e => {
                      e.preventDefault();
                      insertMention(u);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted focus:bg-muted focus:outline-none ${
                      active ? 'bg-muted' : ''
                    }`}
                  >
                    <span className="truncate">{u.name}</span>
                    {isSelf && (
                      <span className="ml-2 rounded bg-primary px-1 text-xs uppercase text-primary-foreground">
                        you
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <Popover
            open={emojiOpen}
            onOpenChange={next => {
              if (!next && ignoreNextCloseRef.current) {
                // Skip closing triggered by focus shift back to input
                ignoreNextCloseRef.current = false;
                return;
              }
              setEmojiOpen(next);
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Add emoji"
                title="Add emoji"
                className={`absolute inset-y-0 right-2 hidden items-center text-muted-foreground hover:text-foreground focus:outline-none md:inline-flex ${mode === 'overlay' ? 'text-[0.65rem]' : ''}`}
                onMouseDown={e => {
                  e.preventDefault();
                }}
              >
                <Smile className={iconSize} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-full max-w-[270px] p-0" sideOffset={4} container={portalContainer}>
              <div
                className="h-[320px] w-full"
                onClick={e => {
                  const target = e.target as HTMLElement;
                  if (target?.dataset?.slot === 'emoji-picker-emoji') {
                    const emojiChar = target.textContent?.trim();
                    if (emojiChar) {
                      onEmojiSelect?.(emojiChar);
                      // Keep popover open, refocus input but ignore the close it might trigger
                      ignoreNextCloseRef.current = true;
                      requestAnimationFrame(() => {
                        const el = inputRef.current;
                        if (el) {
                          el.focus();
                          try {
                            el.selectionStart = el.selectionEnd = el.value.length;
                            el.scrollLeft = el.scrollWidth;
                          } catch {}
                        }
                      });
                    }
                  }
                }}
              >
                <EmojiPicker className="h-full">
                  <EmojiPickerSearch placeholder="Search" autoFocus />
                  <EmojiPickerContent />
                  <EmojiPickerFooter />
                </EmojiPicker>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Voice button */}
        {voice && (
          <Button
            type="button"
            size={mode === 'overlay' ? 'sm' : 'icon'}
            variant={voice.isEnabled ? (voice.isMuted ? 'destructive' : 'outline') : 'outline'}
            onMouseDown={handleVoiceButtonMouseDown}
            onMouseUp={handleVoiceButtonMouseUp}
            onMouseLeave={handleVoiceButtonMouseUp}
            onTouchStart={handleVoiceButtonMouseDown}
            onTouchEnd={handleVoiceButtonMouseUp}
            onTouchCancel={handleVoiceButtonMouseUp}
            onClick={handleVoiceButtonClick}
            onContextMenu={handleVoiceButtonContextMenu}
            disabled={voice.isConnecting}
            className={buttonSize ? `${buttonSize} p-0` : ''}
            title={
              voice.isEnabled
                ? voice.isMuted
                  ? 'Go live (hold to leave voice)'
                  : 'Go silent (hold to leave voice)'
                : 'Hop on voice chat'
            }
            aria-label={voice.isEnabled ? (voice.isMuted ? 'Unmute' : 'Mute') : 'Join Voice'}
          >
            {voice.isEnabled ? (
              voice.isMuted ? (
                <MicOff className={iconSize} />
              ) : (
                <Mic className={iconSize} />
              )
            ) : (
              <Phone className={iconSize} />
            )}
          </Button>
        )}

        {/* Video button */}
        {video && (
          <Button
            type="button"
            size={mode === 'overlay' ? 'sm' : 'icon'}
            variant={video.isEnabled ? (video.isCameraOff ? 'destructive' : 'outline') : 'outline'}
            onMouseDown={handleVideoButtonMouseDown}
            onMouseUp={handleVideoButtonMouseUp}
            onMouseLeave={handleVideoButtonMouseUp}
            onTouchStart={handleVideoButtonMouseDown}
            onTouchEnd={handleVideoButtonMouseUp}
            onTouchCancel={handleVideoButtonMouseUp}
            onClick={handleVideoButtonClick}
            onContextMenu={handleVideoButtonContextMenu}
            disabled={video.isConnecting}
            className={buttonSize ? `${buttonSize} p-0` : ''}
            title={
              video.isEnabled
                ? video.isCameraOff
                  ? 'Turn camera on (hold to leave video)'
                  : 'Turn camera off (hold to leave video)'
                : 'Hop on video chat'
            }
            aria-label={video.isEnabled ? (video.isCameraOff ? 'Enable Camera' : 'Disable Camera') : 'Join Video'}
          >
            {video.isEnabled ? (
              video.isCameraOff ? (
                <CameraOff className={iconSize} />
              ) : (
                <Camera className={iconSize} />
              )
            ) : (
              <Video className={iconSize} />
            )}
          </Button>
        )}

        {/* Send button */}
        <Button
          type="submit"
          variant={inputMessage.trim() ? 'default' : 'secondary'}
          size={mode === 'overlay' ? 'sm' : 'icon'}
          disabled={!inputMessage.trim()}
          className={buttonSize ? `${buttonSize} p-0` : ''}
        >
          <Send className={iconSize} />
        </Button>
      </form>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Subtitles, Plus, X, Settings } from 'lucide-react';
import { SubtitleUploadDialog } from './subtitle-upload-dialog';
import { SubtitleSettingsDialog } from './subtitle-settings-dialog';
import type { SubtitleTrack } from '@/types/schemas';

interface SubtitleManagerProps {
  subtitleTracks: SubtitleTrack[];
  activeTrackId?: string;
  onAddTracks: (tracks: SubtitleTrack[]) => void;
  onRemoveTrack: (trackId: string) => void;
  onActiveTrackChange: (trackId?: string) => void;
  currentVideoTitle?: string;
  isHost?: boolean;
  isFullscreen?: boolean;
}

export function SubtitleManager({
  subtitleTracks,
  activeTrackId,
  onAddTracks,
  onRemoveTrack,
  onActiveTrackChange,
  currentVideoTitle: _currentVideoTitle,
  isHost = false,
  isFullscreen = false,
}: SubtitleManagerProps) {
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleAddSubtitles = (newTracks: SubtitleTrack[]) => {
    onAddTracks(newTracks);
  };

  const handleRemoveTrack = (trackId: string) => {
    onRemoveTrack(trackId);
  };

  const handleTrackSelect = (trackId?: string) => {
    onActiveTrackChange(trackId);
  };

  const handleDropdownClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleTrackClick = (trackId?: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    handleTrackSelect(trackId);
  };

  const handleUploadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSearchDialog(true);
  };

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSettingsDialog(true);
  };

  return (
    <>
      {isFullscreen && isClient ? (
        // Custom fullscreen dropdown using portal
        <FullscreenSubtitleDropdown
          subtitleTracks={subtitleTracks}
          activeTrackId={activeTrackId}
          onTrackSelect={handleTrackSelect}
          onRemoveTrack={handleRemoveTrack}
          onUploadClick={handleUploadClick}
          onSettingsClick={handleSettingsClick}
          isHost={isHost}
          isFullscreen={isFullscreen}
        />
      ) : (
        // Normal dropdown menu
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size={isFullscreen ? 'default' : 'sm'}
              className={`${isFullscreen ? 'h-11 w-11' : 'h-9 w-9'} border border-white/20 bg-black/60 p-0 text-white duration-200 transition-interactive hover:border-primary/50 hover:bg-primary hover:text-primary-foreground`}
              title="Subtitles"
              onClick={e => e.stopPropagation()}
            >
              <Subtitles className={isFullscreen ? 'h-5 w-5' : 'h-4 w-4'} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className={`w-64 ${isFullscreen ? 'z-50' : ''}`}
            onClick={handleDropdownClick}
          >
            <DropdownMenuItem onClick={handleTrackClick(undefined)} className={!activeTrackId ? 'bg-accent' : ''}>
              Off
            </DropdownMenuItem>

            {subtitleTracks.length > 0 && <DropdownMenuSeparator />}

            {subtitleTracks.map(track => (
              <div key={track.id} className="flex items-center">
                <DropdownMenuItem
                  onClick={handleTrackClick(track.id)}
                  className={`min-w-0 flex-1 ${activeTrackId === track.id ? 'bg-accent' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{track.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {track.language.toUpperCase()} • {track.format.toUpperCase()}
                    </div>
                  </div>
                </DropdownMenuItem>
                {/* Remove track button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={e => {
                    e.stopPropagation();
                    handleRemoveTrack(track.id);
                  }}
                  className="h-6 w-6 flex-shrink-0 p-0 hover:bg-destructive hover:text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}

            {/* Upload subtitles */}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleUploadClick}>
              <Plus className="mr-2 h-4 w-4" />
              Upload or Search
            </DropdownMenuItem>

            {/* Subtitle Settings */}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSettingsClick}>
              <Settings className="mr-2 h-4 w-4" />
              Subtitle Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Subtitle upload dialog */}
      <SubtitleUploadDialog
        open={showSearchDialog}
        onOpenChange={setShowSearchDialog}
        onSubtitleSelected={handleAddSubtitles}
      />

      {/* Subtitle settings dialog */}
      <SubtitleSettingsDialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog} />
    </>
  );
}

// Custom fullscreen dropdown component
interface FullscreenSubtitleDropdownProps {
  subtitleTracks: SubtitleTrack[];
  activeTrackId?: string;
  onTrackSelect: (trackId?: string) => void;
  onRemoveTrack: (trackId: string) => void;
  onUploadClick: (e: React.MouseEvent) => void;
  onSettingsClick: (e: React.MouseEvent) => void;
  isHost: boolean;
  isFullscreen: boolean;
}

function FullscreenSubtitleDropdown({
  subtitleTracks,
  activeTrackId,
  onTrackSelect,
  onRemoveTrack,
  onUploadClick,
  onSettingsClick,
  isHost: _isHost,
  isFullscreen: _isFullscreen,
}: FullscreenSubtitleDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleTrackClick = (trackId?: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onTrackSelect(trackId);
    setIsOpen(false);
  };

  const handleDropdownClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Get the fullscreen element
  const fullscreenElement =
    document.fullscreenElement ||
    (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
    (document as Document & { mozFullScreenElement?: Element }).mozFullScreenElement ||
    (document as Document & { msFullscreenElement?: Element }).msFullscreenElement;

  const dropdownContent = isOpen ? (
    <div
      className="fixed bottom-20 right-6 z-[2147483647] w-64 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
      onClick={handleDropdownClick}
    >
      <div
        className={`cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground ${!activeTrackId ? 'bg-accent' : ''}`}
        onClick={handleTrackClick(undefined)}
      >
        Off
      </div>

      {subtitleTracks.length > 0 && <div className="my-1 h-px bg-border" />}

      {subtitleTracks.map(track => (
        <div key={track.id} className="flex items-center">
          <div
            className={`min-w-0 flex-1 cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground ${activeTrackId === track.id ? 'bg-accent' : ''}`}
            onClick={handleTrackClick(track.id)}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{track.label}</div>
              <div className="text-xs text-muted-foreground">
                {track.language.toUpperCase()} • {track.format.toUpperCase()}
              </div>
            </div>
          </div>
          {/* Remove track button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={e => {
              e.stopPropagation();
              onRemoveTrack(track.id);
            }}
            className="h-6 w-6 flex-shrink-0 p-0 hover:bg-destructive hover:text-destructive-foreground"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}

      {/* Upload subtitles */}
      <div className="my-1 h-px bg-border" />
      <div
        className="cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={onUploadClick}
      >
        <Plus className="mr-2 inline h-4 w-4" />
        Upload or Search
      </div>

      {/* Subtitle Settings */}
      <div className="my-1 h-px bg-border" />
      <div
        className="cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={onSettingsClick}
      >
        <Settings className="mr-2 inline h-4 w-4" />
        Subtitle Settings
      </div>
    </div>
  ) : null;

  return (
    <>
      <Button
        variant="secondary"
        size="default"
        onClick={e => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="h-11 w-11 border border-white/20 bg-black/60 p-0 text-white duration-200 transition-interactive hover:border-primary/50 hover:bg-primary hover:text-primary-foreground"
        title="Subtitles"
      >
        <Subtitles className="h-5 w-5" />
      </Button>

      {dropdownContent && fullscreenElement ? createPortal(dropdownContent, fullscreenElement) : dropdownContent}

      {/* Click outside to close */}
      {isOpen && <div className="fixed inset-0 z-[2147483646]" onClick={() => setIsOpen(false)} />}
    </>
  );
}

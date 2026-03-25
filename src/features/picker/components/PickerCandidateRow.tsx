'use client';

import type { PickerCandidate } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface PickerCandidateRowProps {
  candidate: PickerCandidate;
  isCurrentlyPlaying?: boolean; // true = reactive mode winner row
  onSelect: (url: string) => void;
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  'video/mp4': 'MP4',
  'application/x-mpegURL': 'HLS',
  'application/dash+xml': 'DASH',
};

function formatDuration(durationSec: number): string {
  if (durationSec < 60) {
    return `${durationSec}s`;
  }
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function PickerCandidateRow({ candidate, isCurrentlyPlaying, onSelect }: PickerCandidateRowProps) {
  const { mediaUrl, mediaType, durationSec, bitrate, isLive } = candidate;

  const formatLabel = MEDIA_TYPE_LABELS[mediaType] ?? mediaType;

  const metadataParts: string[] = [formatLabel];

  let durationElement: React.ReactNode = null;
  if (isLive) {
    durationElement = (
      <Badge variant="secondary" className="text-xs">
        LIVE
      </Badge>
    );
  } else if (durationSec !== null && durationSec !== undefined) {
    metadataParts.push(formatDuration(durationSec));
  }

  if (bitrate !== null && bitrate !== undefined) {
    metadataParts.push(`${(bitrate / 1_000_000).toFixed(1)} Mbps`);
  }

  const isLikelyAd = durationSec !== null && durationSec !== undefined && durationSec < 90 && !isLive;

  // Build metadata display: format · [duration or LIVE] · bitrate
  // When isLive, we render format as text and LIVE as a badge
  const textParts: string[] = [formatLabel];
  if (!isLive && durationSec !== null && durationSec !== undefined) {
    textParts.push(formatDuration(durationSec));
  }
  if (bitrate !== null && bitrate !== undefined) {
    textParts.push(`${(bitrate / 1_000_000).toFixed(1)} Mbps`);
  }

  return (
    <div className="flex items-center justify-between min-h-[44px] py-2 px-4 border-b border-border last:border-b-0 hover:bg-secondary/20 transition-colors cursor-default">
      {/* Left side: metadata */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span className="text-primary-foreground">{formatLabel}</span>
        {isLive ? (
          <>
            <span className="text-muted-foreground">·</span>
            <Badge variant="secondary" className="text-xs">
              LIVE
            </Badge>
          </>
        ) : durationSec !== null && durationSec !== undefined ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-primary-foreground">{formatDuration(durationSec)}</span>
          </>
        ) : null}
        {bitrate !== null && bitrate !== undefined ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-primary-foreground">{(bitrate / 1_000_000).toFixed(1)} Mbps</span>
          </>
        ) : null}
      </div>

      {/* Right side: badges and select button */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        {isCurrentlyPlaying && (
          <Badge variant="secondary" className="text-xs">
            Playing now
          </Badge>
        )}
        {isLikelyAd && (
          <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-400/50">
            ⚠ likely ad
          </Badge>
        )}
        <Button variant="secondary" size="sm" onClick={() => onSelect(mediaUrl)}>
          [Select]
        </Button>
      </div>
    </div>
  );
}

'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { PickerCandidate } from '@/types';
import { PickerCandidateRow } from './PickerCandidateRow';

interface PickerOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'proactive' | 'reactive';
  candidates: PickerCandidate[];
  winnerPlaybackUrl: string;
  reason?: 'lowConfidence' | 'ambiguous' | 'both';
  onSelect: (selectedUrl: string) => void;
  onDismiss: () => void;
}

const REASON_SUBTITLES: Record<string, string> = {
  ambiguous: 'Two streams scored similarly — you decide.',
  lowConfidence: "Lens wasn't confident about the main stream.",
  both: 'Low confidence and two similar streams — you decide.',
};

export function PickerOverlay({
  open,
  onOpenChange,
  mode,
  candidates,
  winnerPlaybackUrl: _winnerPlaybackUrl,
  reason,
  onSelect,
  onDismiss,
}: PickerOverlayProps) {
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      // Dialog is closing
      if (mode === 'proactive') {
        // Proactive dismiss triggers auto-select of winner
        onDismiss();
      } else {
        // Reactive dismiss just closes — no action
        onOpenChange(false);
      }
    } else {
      onOpenChange(true);
    }
  };

  const handleSelect = (selectedUrl: string) => {
    onSelect(selectedUrl);
    onOpenChange(false);
  };

  const subtitle = mode === 'proactive' && reason ? REASON_SUBTITLES[reason] : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[480px] p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {mode === 'proactive' ? 'Pick a stream' : 'Switch stream'}
          </DialogTitle>
          {subtitle && <DialogDescription className="text-sm text-muted-foreground">{subtitle}</DialogDescription>}
        </DialogHeader>

        <ScrollArea className="mt-4 max-h-[320px]">
          {candidates.map(candidate => (
            <PickerCandidateRow
              key={candidate.mediaUrl}
              candidate={candidate}
              isCurrentlyPlaying={mode === 'reactive' && candidate.isWinner}
              onSelect={handleSelect}
            />
          ))}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

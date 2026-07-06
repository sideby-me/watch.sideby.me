'use client';

import React, { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { logDebug } from '@/src/core/logger';

// ── RemoteAudioElement ─────────────────────────────────────────────────────────
// Renders a single hidden <audio> element for one remote participant's audio track.
// srcObject is re-attached ONLY when the audio-track identity actually changes
// (same discipline as the VideoChatGrid video fix — avoids tearing down playback).
// Each element is keyed by opaque participantId and wired from that
// participant's own audioTrack only — no cross-participant track sharing.

interface RemoteAudioElementProps {
  participantId: string;
  audioTrack: MediaStreamTrack;
}

const RemoteAudioElement: React.FC<RemoteAudioElementProps> = ({ participantId, audioTrack }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Wire srcObject: compare attached track identity, reassign only on change
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const attachedTrack = (el.srcObject as MediaStream | null)?.getAudioTracks()[0];
    if (attachedTrack?.id === audioTrack.id) return; // already attached — no-op

    el.srcObject = new MediaStream([audioTrack]);

    el.play().catch(err => {
      logDebug('other', 'remote_audio_play_blocked', '[RemoteAudio] autoplay blocked', {
        participantId,
        error: String(err),
      });

      // One-time toast with a click handler that retries play on all blocked audio elements
      const toastId = 'remote-audio-autoplay';
      toast.message('Enable audio', {
        id: toastId,
        description: 'Your browser is blocking audio. Click anywhere on the page to unmute participants.',
        duration: Infinity,
      });

      const retryPlayback = () => {
        document.querySelectorAll<HTMLAudioElement>('audio[data-remote-audio]').forEach(a => {
          a.play().catch(() => {
            // If still blocked after user interaction, give up silently
          });
        });
        toast.dismiss(toastId);
        document.removeEventListener('click', retryPlayback);
      };

      document.addEventListener('click', retryPlayback, { once: true });
    });
  }, [audioTrack, participantId]);

  // Cleanup: stop playback when the track changes or the element unmounts
  useEffect(() => {
    return () => {
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.srcObject = null;
      }
    };
  }, []);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      // NOT muted — this is remote audio that must be audible
      data-remote-audio="true"
      data-participant-id={participantId}
      className="hidden"
    />
  );
};

// ── RemoteAudio ────────────────────────────────────────────────────────────────
// Renders one RemoteAudioElement per remote participant that has an audioTrack.
// Decoupled from the video grid entirely so audio plays even when the local or
// remote camera is off (GAP A1). Mount this whenever the SFU session is active
// (mic OR camera), independent of the camera gate.

interface RemoteAudioProps {
  remoteParticipants: Array<{
    participantId: string;
    audioTrack: MediaStreamTrack | null;
    videoTrack: MediaStreamTrack | null;
  }>;
}

export const RemoteAudio: React.FC<RemoteAudioProps> = ({ remoteParticipants }) => {
  const withAudio = remoteParticipants.filter(p => p.audioTrack !== null);
  if (withAudio.length === 0) return null;

  return (
    <>
      {withAudio.map(p => (
        <RemoteAudioElement key={p.participantId} participantId={p.participantId} audioTrack={p.audioTrack!} />
      ))}
    </>
  );
};

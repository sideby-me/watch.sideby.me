'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/src/core/socket';
import { logDebug } from '@/src/core/logger';

const PROBE_COUNT = 5;
const PROBE_INTERVAL_MS = 200;

// NTP-style clock offset measurement
export function useClockOffset() {
  const { socket } = useSocket();
  const [clockOffset, setClockOffset] = useState(0);
  const measuredRef = useRef(false);

  useEffect(() => {
    if (!socket) return;

    type Sample = { rtt: number; offset: number };
    const samples: Sample[] = [];
    let probesSent = 0;
    let probeTimer: ReturnType<typeof setTimeout> | null = null;

    const handlePong = ({ clientSendTime, serverTime }: { clientSendTime: number; serverTime: number }) => {
      const now = Date.now();
      const rtt = now - clientSendTime;
      const offset = serverTime - (clientSendTime + rtt / 2);
      samples.push({ rtt, offset });

      logDebug('video', 'clock_sample', `Clock sample: rtt=${rtt}ms, offset=${offset.toFixed(1)}ms`);

      if (samples.length >= PROBE_COUNT) {
        finalize();
      }
    };

    const finalize = () => {
      if (samples.length === 0) return;

      // Discard the sample with highest RTT (most likely delayed/queued)
      const sorted = [...samples].sort((a, b) => a.rtt - b.rtt);
      const trimmed = sorted.slice(0, -1); // drop worst
      const candidates = trimmed.length > 0 ? trimmed : sorted;

      const avgOffset = candidates.reduce((sum, s) => sum + s.offset, 0) / candidates.length;
      const rounded = Math.round(avgOffset);
      setClockOffset(rounded);
      measuredRef.current = true;

      logDebug('video', 'clock_offset', `Clock offset finalized: ${rounded}ms (from ${candidates.length} samples)`);
    };

    const sendProbe = () => {
      if (probesSent >= PROBE_COUNT) return;
      socket.emit('time-ping', { clientSendTime: Date.now() });
      probesSent++;

      if (probesSent < PROBE_COUNT) {
        probeTimer = setTimeout(sendProbe, PROBE_INTERVAL_MS);
      }
    };

    const startMeasurement = () => {
      samples.length = 0;
      probesSent = 0;
      measuredRef.current = false;
      sendProbe();
    };

    socket.on('time-pong', handlePong);

    // Measure on current connection and on every reconnect
    if (socket.connected) {
      startMeasurement();
    }
    socket.on('connect', startMeasurement);

    return () => {
      socket.off('time-pong', handlePong);
      socket.off('connect', startMeasurement);
      if (probeTimer) clearTimeout(probeTimer);
    };
  }, [socket]);

  const getServerNow = useCallback(() => {
    return Date.now() + clockOffset;
  }, [clockOffset]);

  return {
    clockOffset,
    isMeasured: measuredRef.current,
    getServerNow,
  };
}

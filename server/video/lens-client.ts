// SSE client for communicating with the Lens capture service

import type { Socket } from 'socket.io';
import { logEvent } from '@/server/logger';
import type { CorrelationContext } from '@/server/telemetry/correlation';
import { injectCorrelationHeaders } from '@/server/telemetry/http-propagation';

const LENS_TIMEOUT_MS = 35_000; // 5s buffer over 30s capture abort

export interface LensCaptureResult {
  uuid: string;
  playbackUrl: string;
  mediaType: 'hls' | 'mp4' | 'other';
  expiresAt: number;
  lowConfidence: boolean;
  ambiguous: boolean;
  alternatives: Array<{
    mediaUrl: string;
    mediaType: 'hls' | 'mp4' | 'other';
    durationSec: number | null;
    bitrate: number | null;
    isLive: boolean | undefined;
    headers: Record<string, string>;
  }>;
}

export class LensClient {
  //  Post a capture request to Lens and stream the SSE response. Relays status events to the socket if provided.
  async capture(url: string, socket?: Socket, correlation?: CorrelationContext): Promise<LensCaptureResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LENS_TIMEOUT_MS);

    const lensUrl = process.env.LENS_URL ?? 'http://localhost:4000';
    const lensSecret = process.env.LENS_SHARED_SECRET ?? '';

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(lensSecret ? { 'X-Lens-Secret': lensSecret } : {}),
      };

      if (correlation) {
        injectCorrelationHeaders(headers, correlation);
      }

      const res = await fetch(`${lensUrl}/capture`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Lens returned ${res.status}: ${body}`);
      }

      if (!res.body) {
        throw new Error('Lens response has no body');
      }

      return await this.parseSSEStream(res.body, socket);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Lens capture timed out (35s)');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseSSEStream(body: ReadableStream<Uint8Array>, socket?: Socket): Promise<LensCaptureResult> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    return new Promise<LensCaptureResult>(async (resolve, reject) => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            reject(new Error('Lens SSE stream ended without done event'));
            return;
          }

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

          let currentEventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              try {
                const parsed = JSON.parse(data);
                this.handleEvent(currentEventType, parsed, socket, resolve, reject);
              } catch {
                // Non-JSON data line, skip
              }
              currentEventType = '';
            }
          }
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  private handleEvent(
    type: string,
    data: Record<string, unknown>,
    socket: Socket | undefined,
    resolve: (result: LensCaptureResult) => void,
    reject: (error: Error) => void
  ): void {
    switch (type) {
      case 'status':
        logEvent({
          level: 'info',
          domain: 'video',
          event: 'lens_status',
          message: `lens: ${data.status}`,
          meta: data,
        });
        // Relay to socket if available
        if (socket) {
          socket.emit('video-loading-status', {
            status: String(data.status),
            message: data.message ? String(data.message) : undefined,
          });
        }
        break;

      case 'done':
        resolve({
          uuid: String(data.uuid),
          playbackUrl: String(data.playbackUrl),
          mediaType: data.mediaType as 'hls' | 'mp4' | 'other',
          expiresAt: Number(data.expiresAt),
          lowConfidence: Boolean(data.lowConfidence),
          ambiguous: Boolean(data.ambiguous),
          alternatives: Array.isArray(data.alternatives)
            ? (data.alternatives as LensCaptureResult['alternatives'])
            : [],
        });
        break;

      case 'error':
        reject(new Error(`Lens capture failed: ${data.code} - ${data.message}`));
        break;
    }
  }
}

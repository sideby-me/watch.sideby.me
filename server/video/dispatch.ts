/**
 * 6-tier dispatch: decides how to deliver a video URL.
 *
 * Tiers (first match wins):
 *  a. Non-http/https protocol → throw ValidationError
 *  b. DRM hostname match → throw ValidationError
 *  c. YouTube hostname → direct playback
 *  d. Already a pipe URL (isProxiedUrl) → return as-is
 *  e. Direct media extension without signed params → HEAD probe → file-direct / file-proxy / Lens
 *  f. Everything else → Lens capture
 */

import { logEvent } from '@/server/logger';
import { isBlocked } from './blocklist';
import { LensClient } from './lens-client';
import { ValidationError } from '../errors';
import type { Socket } from 'socket.io';
import type { PickerCandidate } from '@/types';
import type { CorrelationContext } from '@/server/telemetry/correlation';

// Client-side helpers are importable from the shared lib
const VIDEO_PROXY_URL = process.env.NEXT_PUBLIC_VIDEO_PROXY_URL?.trim() ?? 'http://localhost:8787';
const PROXY_ENABLED = Boolean(VIDEO_PROXY_URL);

function buildProxyUrl(targetUrl: string): string {
  if (!PROXY_ENABLED) return targetUrl; // serve direct when proxy not configured
  const params = new URLSearchParams({ url: targetUrl });
  return `${VIDEO_PROXY_URL}?${params.toString()}`;
}

function buildLensPlaybackUrl(uuid: string): string {
  if (!PROXY_ENABLED) throw new Error('NEXT_PUBLIC_VIDEO_PROXY_URL is not set - cannot build Lens playback URL');
  return `${VIDEO_PROXY_URL}?uuid=${uuid}`;
}

function isProxiedUrl(url: string): boolean {
  if (!PROXY_ENABLED || !url) return false;
  return url.startsWith(VIDEO_PROXY_URL);
}

export interface DispatchResult {
  playbackUrl: string;
  videoType: 'youtube' | 'mp4' | 'm3u8';
  deliveryType: 'youtube' | 'file-direct' | 'file-proxy' | 'hls';
  lensUuid?: string;
  expiresAt?: number;
  originalUrl: string;
  pickerRequired?: boolean;
  pickerCandidates?: PickerCandidate[];
  pickerReason?: 'lowConfidence' | 'ambiguous' | 'both';
}

export interface DispatchLogContext {
  requestId?: string;
  dispatchId?: string;
  traceId?: string;
  spanId?: string;
  roomId?: string;
  userId?: string;
  traceparent?: string;
  baggage?: string;
}

function toCorrelationContext(context?: DispatchLogContext): CorrelationContext | undefined {
  if (!context) {
    return undefined;
  }

  const traceId = context.traceId ?? '4bf92f3577b34da6a3ce929d0e0e4736';
  const spanId = context.spanId ?? '00f067aa0ba902b7';

  return {
    trace_id: traceId,
    span_id: spanId,
    request_id: context.requestId ?? null,
    dispatch_id: context.dispatchId ?? null,
    room_id: context.roomId ?? null,
    user_id: context.userId ?? null,
    traceparent: context.traceparent ?? `00-${traceId}-${spanId}-01`,
    baggage: context.baggage,
  };
}

//DRM-protected streaming services that cannot be proxied
const DRM_HOSTS = new Set([
  'netflix.com',
  'www.netflix.com',
  'disneyplus.com',
  'www.disneyplus.com',
  'hulu.com',
  'www.hulu.com',
  'primevideo.com',
  'www.primevideo.com',
  'tv.apple.com',
  'play.max.com',
  'www.peacocktv.com',
  'www.paramountplus.com',
]);

const DIRECT_MEDIA_EXTS = ['.mp4', '.webm', '.m3u8', '.mpd'];

const SIGNED_PARAMS_EXACT = ['exp', 'token', 'sig', 'signature', 'hash', 'validfrom', 'validto'];

function isDrmHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return DRM_HOSTS.has(lower) || [...DRM_HOSTS].some(h => lower.endsWith(`.${h}`));
}

function isYouTubeHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'youtube.com' ||
    lower === 'www.youtube.com' ||
    lower === 'm.youtube.com' ||
    lower === 'youtu.be' ||
    lower === 'www.youtube-nocookie.com'
  );
}

function hasDirectMediaExt(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return DIRECT_MEDIA_EXTS.some(ext => lower.endsWith(ext) || lower.includes(`${ext}?`));
}

function hasSignedParams(searchParams: URLSearchParams): boolean {
  for (const key of searchParams.keys()) {
    const lower = key.toLowerCase();
    if (lower.startsWith('x-amz-')) return true;
    if (SIGNED_PARAMS_EXACT.includes(lower)) return true;
  }
  return false;
}

interface HeadProbeResult {
  status: number;
  cors: 'permissive' | 'restrictive';
}

async function headProbe(url: string): Promise<HeadProbeResult | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const appOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000';
      const isM3u8 = url.toLowerCase().includes('.m3u8');
      const probeHeaders: Record<string, string> = isM3u8 ? {} : { Origin: appOrigin };
      const res = await fetch(url, {
        method: 'HEAD',
        headers: probeHeaders,
        signal: controller.signal,
        redirect: 'follow',
      });
      const acao = res.headers.get('access-control-allow-origin');
      const cors: 'permissive' | 'restrictive' = acao === '*' ? 'permissive' : 'restrictive';
      return { status: res.status, cors };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null; // timeout or network error → treat as non-2xx
  }
}

function videoTypeFromUrl(pathname: string): 'mp4' | 'm3u8' {
  return pathname.toLowerCase().includes('.m3u8') ? 'm3u8' : 'mp4';
}

function lensMediaTypeToPicker(
  t: 'hls' | 'mp4' | 'other'
): 'video/mp4' | 'application/x-mpegURL' | 'application/dash+xml' {
  if (t === 'hls') return 'application/x-mpegURL';
  return 'video/mp4'; // 'mp4' and 'other' both map to video/mp4
}

function buildPickerCandidates(result: import('./lens-client').LensCaptureResult): PickerCandidate[] {
  // Winner is always first with isWinner: true
  const winner: PickerCandidate = {
    mediaUrl: result.playbackUrl, // NOTE: winner mediaUrl is the pre-built pipe?uuid= URL
    mediaType: lensMediaTypeToPicker(result.mediaType),
    durationSec: null,
    bitrate: null,
    isLive: undefined,
    headers: {},
    isWinner: true,
  };
  const rest: PickerCandidate[] = result.alternatives.map(alt => ({
    mediaUrl: alt.mediaUrl,
    mediaType: lensMediaTypeToPicker(alt.mediaType),
    durationSec: alt.durationSec,
    bitrate: alt.bitrate,
    isLive: alt.isLive,
    headers: alt.headers,
    isWinner: false,
  }));
  return [winner, ...rest];
}

const lensClient = new LensClient();

// Dispatch a raw video URL to the correct delivery path.
export async function dispatch(rawUrl: string, socket?: Socket, context?: DispatchLogContext): Promise<DispatchResult> {
  const hasCoreCorrelation = Boolean(context?.requestId || context?.dispatchId || context?.traceId || context?.spanId);
  const missingCorrelationKeys = [!context?.roomId ? 'room_id' : null, !context?.userId ? 'user_id' : null].filter(Boolean);

  if (hasCoreCorrelation && missingCorrelationKeys.length > 0) {
    logEvent({
      level: 'warn',
      domain: 'video',
      event: 'dispatch_missing_non_core_ids',
      message: 'Dispatch received missing non-core correlation IDs',
      requestId: context?.requestId,
      dispatchId: context?.dispatchId,
      traceId: context?.traceId,
      spanId: context?.spanId,
      roomId: context?.roomId,
      userId: context?.userId,
      meta: { missingCorrelationKeys },
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  // Tier a: Non-http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Unsupported protocol');
  }

  // Tier b: DRM hosts
  if (isDrmHost(parsed.hostname)) {
    throw new Error(`DRM-protected content from ${parsed.hostname} cannot be played - use the native app instead.`);
  }

  // Check blocklist
  const blockCheck = isBlocked(rawUrl);
  if (blockCheck.blocked) {
    throw new ValidationError(`URL is blocked: ${blockCheck.reason}`);
  }

  // Tier c: YouTube
  if (isYouTubeHost(parsed.hostname)) {
    logEvent({
      level: 'info',
      domain: 'video',
      event: 'dispatch_youtube',
      message: `dispatch: YouTube → direct`,
      requestId: context?.requestId,
      dispatchId: context?.dispatchId,
      traceId: context?.traceId,
      spanId: context?.spanId,
      roomId: context?.roomId,
      userId: context?.userId,
      meta: { url: rawUrl },
    });
    return {
      playbackUrl: rawUrl,
      videoType: 'youtube',
      deliveryType: 'youtube',
      originalUrl: rawUrl,
    };
  }

  // Tier d: Already proxied
  if (isProxiedUrl(rawUrl)) {
    // Infer videoType from the embedded url= param; uuid= paths are Lens output (predominantly HLS)
    let vType: 'mp4' | 'm3u8' = 'mp4';
    try {
      const inner = new URL(rawUrl);
      const innerUrl = inner.searchParams.get('url');
      if (innerUrl) vType = videoTypeFromUrl(new URL(innerUrl).pathname);
      else if (inner.searchParams.has('uuid')) vType = 'm3u8';
    } catch {
      /* leave as 'mp4' */
    }
    logEvent({
      level: 'info',
      domain: 'video',
      event: 'dispatch_proxied',
      message: `dispatch: already proxied → as-is (${vType})`,
      requestId: context?.requestId,
      dispatchId: context?.dispatchId,
      traceId: context?.traceId,
      spanId: context?.spanId,
      roomId: context?.roomId,
      userId: context?.userId,
      meta: { url: rawUrl },
    });
    return {
      playbackUrl: rawUrl,
      videoType: vType,
      deliveryType: 'file-proxy',
      originalUrl: rawUrl,
    };
  }

  // Tier e: Direct media extension without signed params → HEAD probe to decide delivery
  if (hasDirectMediaExt(parsed.pathname) && !hasSignedParams(parsed.searchParams)) {
    const probe = await headProbe(rawUrl);
    if (probe && probe.status >= 200 && probe.status < 300) {
      const vType = videoTypeFromUrl(parsed.pathname);
      if (probe.cors === 'permissive') {
        logEvent({
          level: 'info',
          domain: 'video',
          event: 'dispatch_direct',
          message: `dispatch: direct ${vType} → file-direct (permissive CORS)`,
          requestId: context?.requestId,
          dispatchId: context?.dispatchId,
          traceId: context?.traceId,
          spanId: context?.spanId,
          roomId: context?.roomId,
          userId: context?.userId,
          meta: { url: rawUrl },
        });
        return {
          playbackUrl: rawUrl,
          videoType: vType,
          deliveryType: 'file-direct',
          originalUrl: rawUrl,
        };
      } else {
        logEvent({
          level: 'info',
          domain: 'video',
          event: 'dispatch_direct',
          message: `dispatch: direct ${vType} → file-proxy (restrictive/no CORS)`,
          requestId: context?.requestId,
          dispatchId: context?.dispatchId,
          traceId: context?.traceId,
          spanId: context?.spanId,
          roomId: context?.roomId,
          userId: context?.userId,
          meta: { url: rawUrl },
        });
        return {
          playbackUrl: buildProxyUrl(rawUrl),
          videoType: vType,
          deliveryType: vType === 'm3u8' ? 'hls' : 'file-proxy',
          originalUrl: rawUrl,
        };
      }
    }
    // 401/403/405/non-2xx or timeout → for M3U8 playlists, reject immediately (Lens can't help)
    // For other media types (mp4/webm), fall through to Lens which may find a stream via page context
    if (videoTypeFromUrl(parsed.pathname) === 'm3u8') {
      throw new ValidationError(
        `This M3U8 stream returned ${probe ? probe.status : 'no response'} — it likely requires a signed or authenticated URL. Grab the full signed link from the source page.`
      );
    }
    logEvent({
      level: 'info',
      domain: 'video',
      event: 'dispatch_direct_fallback',
      message: `dispatch: HEAD probe ${probe ? probe.status : 'failed'} → falling through to Lens`,
      requestId: context?.requestId,
      dispatchId: context?.dispatchId,
      traceId: context?.traceId,
      spanId: context?.spanId,
      roomId: context?.roomId,
      userId: context?.userId,
      meta: { url: rawUrl },
    });
  }

  // Tier f: Everything else → Lens
  logEvent({
    level: 'info',
    domain: 'video',
    event: 'dispatch_lens',
    message: `dispatch: → Lens capture`,
    requestId: context?.requestId,
    dispatchId: context?.dispatchId,
    traceId: context?.traceId,
    spanId: context?.spanId,
    roomId: context?.roomId,
    userId: context?.userId,
    meta: { url: rawUrl },
  });

  const result = await lensClient.capture(rawUrl, socket, toCorrelationContext(context));

  const vType = result.mediaType === 'hls' ? 'm3u8' : 'mp4';
  const lensPlaybackUrl = buildLensPlaybackUrl(result.uuid);
  const needsPicker = result.lowConfidence || result.ambiguous;

  return {
    playbackUrl: lensPlaybackUrl,
    videoType: vType,
    deliveryType: result.mediaType === 'hls' ? 'hls' : 'file-proxy',
    lensUuid: result.uuid,
    expiresAt: result.expiresAt,
    originalUrl: rawUrl,
    ...(needsPicker
      ? {
          pickerRequired: true,
          pickerCandidates: buildPickerCandidates(result),
          pickerReason: (result.lowConfidence && result.ambiguous
            ? 'both'
            : result.lowConfidence
              ? 'lowConfidence'
              : 'ambiguous') as 'lowConfidence' | 'ambiguous' | 'both',
        }
      : {}),
  };
}

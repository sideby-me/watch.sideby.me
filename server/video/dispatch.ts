/**
 * 7-tier dispatch: decides how to deliver a video URL.
 *
 * Tiers (first match wins):
 *  A. Non-http/https protocol → reject
 *  B. DRM hostname → reject
 *  C. YouTube hostname → direct playback
 *  D. Already a pipe URL → pass-through
 *  E. Direct media extension (.mp4/.webm/.m3u8/.mpd):
 *       signed params → pipe directly (auth is in the URL, no probe needed)
 *       unsigned + m3u8 → HEAD probe: 2xx → pipe; non-2xx → Lens
 *       unsigned + mp4/webm → HEAD probe: 2xx+permissive CORS → file-direct; 2xx+restrictive → pipe; non-2xx → Lens
 *  F. No media extension, unsigned → content-type probe (+ browser-UA retry on text/html) → route or Lens
 *  G. Everything else → Lens capture
 */

import { logEvent } from '@/server/logger';
import { isBlocked } from './blocklist';
import { LensClient } from './lens-client';
import { ValidationError } from '../errors';
import { recordDispatchStart, recordDispatchOutcome, recordDispatchError } from '../telemetry/metrics';
import type { Socket } from 'socket.io';
import type { PickerCandidate } from '@/types';
import type { CorrelationContext } from '@/server/telemetry/correlation';

// Client-side helpers are importable from the shared lib
const VIDEO_PROXY_URL = process.env.NEXT_PUBLIC_VIDEO_PROXY_URL?.trim() ?? 'http://localhost:8787';
const PROXY_ENABLED = Boolean(VIDEO_PROXY_URL);

function buildProxyUrl(targetUrl: string, extra?: Record<string, string>): string {
  if (!PROXY_ENABLED) return targetUrl; // serve direct when proxy not configured
  const params = new URLSearchParams({ url: targetUrl, ...extra });
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
  pageUrl?: string;
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
  contentType?: string;
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function headProbe(url: string, userAgent?: string): Promise<HeadProbeResult | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const appOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000';
      const isM3u8 = url.toLowerCase().includes('.m3u8');
      const probeHeaders: Record<string, string> = isM3u8 ? {} : { Origin: appOrigin };
      if (userAgent) probeHeaders['User-Agent'] = userAgent;
      const res = await fetch(url, {
        method: 'HEAD',
        headers: probeHeaders,
        signal: controller.signal,
        redirect: 'follow',
      });
      const acao = res.headers.get('access-control-allow-origin');
      const cors: 'permissive' | 'restrictive' = acao === '*' ? 'permissive' : 'restrictive';
      const contentType = res.headers.get('content-type') ?? undefined;
      return { status: res.status, cors, contentType };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null; // timeout or network error → treat as non-2xx
  }
}

const HLS_CONTENT_TYPES = new Set([
  'application/x-mpegurl',
  'application/vnd.apple.mpegurl',
  'application/vnd.apple.mpegURL',
  'audio/mpegurl',
  'audio/x-mpegurl',
]);

const MP4_CONTENT_TYPES = new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']);

function mediaTypeFromContentType(contentType: string): 'mp4' | 'm3u8' | null {
  const base = contentType.split(';')[0].trim().toLowerCase();
  if (HLS_CONTENT_TYPES.has(base)) return 'm3u8';
  if (base === 'application/dash+xml') return 'mp4'; // treat DASH as mp4 for player routing
  if (MP4_CONTENT_TYPES.has(base)) return 'mp4';
  return null;
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
  const stopTimer = recordDispatchStart('set-video');

  try {
    const hasCoreCorrelation = Boolean(
      context?.requestId || context?.dispatchId || context?.traceId || context?.spanId
    );
    const missingCorrelationKeys = [!context?.roomId ? 'room_id' : null, !context?.userId ? 'user_id' : null].filter(
      Boolean
    );

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
      stopTimer();
      recordDispatchOutcome('set-video', 'success');
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
      stopTimer();
      recordDispatchOutcome('set-video', 'success');
      return {
        playbackUrl: rawUrl,
        videoType: vType,
        deliveryType: 'file-proxy',
        originalUrl: rawUrl,
      };
    }

    // Tier E: Direct media extension (.mp4 / .webm / .m3u8 / .mpd)
    let tierEProbe: HeadProbeResult | null = null;
    if (hasDirectMediaExt(parsed.pathname)) {
      const vType = videoTypeFromUrl(parsed.pathname);
      const signed = hasSignedParams(parsed.searchParams);

      if (signed) {
        // Auth is embedded in the URL - pipe it directly without probing.
        // Lens is wrong for direct media files: Chromium downloads them instead of navigating,
        // immediately closing the page ("Target page, context or browser has been closed").
        logEvent({
          level: 'info',
          domain: 'video',
          event: 'dispatch_direct',
          message: `dispatch: direct ${vType} → file-proxy (signed URL)`,
          requestId: context?.requestId,
          dispatchId: context?.dispatchId,
          traceId: context?.traceId,
          spanId: context?.spanId,
          roomId: context?.roomId,
          userId: context?.userId,
          meta: { url: rawUrl },
        });
        stopTimer();
        recordDispatchOutcome('set-video', 'success');
        return {
          playbackUrl: buildProxyUrl(rawUrl),
          videoType: vType,
          deliveryType: vType === 'm3u8' ? 'hls' : 'file-proxy',
          originalUrl: rawUrl,
        };
      }

      // Unsigned - HEAD probe to decide delivery.
      // M3U8 always goes through pipe even with permissive CORS: pipe rewrites segment URLs and avoids the HEAD/GET header discrepancy (HEAD omits Origin/UA, so ACAO:* on HEAD doesn't guarantee the browser's GET will succeed).
      const probe = await headProbe(rawUrl);
      tierEProbe = probe;
      if (probe && probe.status >= 200 && probe.status < 300) {
        if (probe.cors === 'permissive' && vType !== 'm3u8') {
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
          stopTimer();
          recordDispatchOutcome('set-video', 'success');
          return {
            playbackUrl: rawUrl,
            videoType: vType,
            deliveryType: 'file-direct',
            originalUrl: rawUrl,
          };
        } else {
          const reason = vType === 'm3u8' ? 'hls (always proxied)' : 'restrictive/no CORS';
          logEvent({
            level: 'info',
            domain: 'video',
            event: 'dispatch_direct',
            message: `dispatch: direct ${vType} → file-proxy (${reason})`,
            requestId: context?.requestId,
            dispatchId: context?.dispatchId,
            traceId: context?.traceId,
            spanId: context?.spanId,
            roomId: context?.roomId,
            userId: context?.userId,
            meta: { url: rawUrl },
          });
          stopTimer();
          recordDispatchOutcome('set-video', 'success');
          return {
            playbackUrl: buildProxyUrl(rawUrl),
            videoType: vType,
            deliveryType: vType === 'm3u8' ? 'hls' : 'file-proxy',
            originalUrl: rawUrl,
          };
        }
      }
      // non-2xx or timeout → fall through to Lens. A real browser may succeed where the plain
      // Node.js HEAD probe failed (UA checks, Referer requirements, cookie gates).
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

    // Tier F: No media extension, unsigned — content-type probe before paying Lens latency.
    // Handles raw HLS/MP4 endpoints with no file extension, and extensionless page URLs that
    // Tier E already probed (reuse tierEProbe to avoid a second round-trip).
    // Some origins do UA-based bot detection and return text/html to plain Node.js fetch - a second probe with a browser UA reveals the real content-type.
    if (!hasSignedParams(parsed.searchParams)) {
      let ctProbe = tierEProbe ?? (await headProbe(rawUrl));
      let needsBrowserUa = false;

      if (
        ctProbe &&
        ctProbe.status >= 200 &&
        ctProbe.status < 300 &&
        ctProbe.contentType?.toLowerCase().includes('text/html')
      ) {
        const retryProbe = await headProbe(rawUrl, BROWSER_UA);
        if (retryProbe && retryProbe.status >= 200 && retryProbe.status < 300) {
          const retryType = mediaTypeFromContentType(retryProbe.contentType ?? '');
          if (retryType) {
            ctProbe = retryProbe;
            needsBrowserUa = true;
          }
        }
      }

      if (ctProbe && ctProbe.status >= 200 && ctProbe.status < 300 && ctProbe.contentType) {
        const vType = mediaTypeFromContentType(ctProbe.contentType);
        if (vType) {
          const proxyExtra = needsBrowserUa ? { pipe_ua: 'desktop' } : undefined;
          const deliveryType =
            vType === 'm3u8' ? 'hls' : ctProbe.cors === 'permissive' && !needsBrowserUa ? 'file-direct' : 'file-proxy';
          logEvent({
            level: 'info',
            domain: 'video',
            event: 'dispatch_content_type',
            message: `dispatch: content-type ${ctProbe.contentType} → ${deliveryType}${needsBrowserUa ? ' (browser-ua)' : ''}`,
            requestId: context?.requestId,
            dispatchId: context?.dispatchId,
            traceId: context?.traceId,
            spanId: context?.spanId,
            roomId: context?.roomId,
            userId: context?.userId,
            meta: { url: rawUrl, contentType: ctProbe.contentType, needsBrowserUa },
          });
          stopTimer();
          recordDispatchOutcome('set-video', 'success');
          const playbackUrl =
            ctProbe.cors === 'permissive' && vType !== 'm3u8' && !needsBrowserUa
              ? rawUrl
              : buildProxyUrl(rawUrl, proxyExtra);
          return {
            playbackUrl,
            videoType: vType,
            deliveryType,
            originalUrl: rawUrl,
          };
        }
      }
      logEvent({
        level: 'info',
        domain: 'video',
        event: 'dispatch_content_type_miss',
        message: `dispatch: content-type probe miss (status=${ctProbe?.status ?? 'null'} ct=${ctProbe?.contentType ?? 'none'}) → Lens`,
        requestId: context?.requestId,
        dispatchId: context?.dispatchId,
        traceId: context?.traceId,
        spanId: context?.spanId,
        roomId: context?.roomId,
        userId: context?.userId,
        meta: { url: rawUrl, probeStatus: ctProbe?.status ?? null, contentType: ctProbe?.contentType ?? null },
      });
    }

    // Tier G: Lens - open the source page (or raw URL as fallback) with full browser context.
    const lensTargetUrl = context?.pageUrl ?? rawUrl;
    logEvent({
      level: 'info',
      domain: 'video',
      event: 'dispatch_lens',
      message: `dispatch: → Lens capture${lensTargetUrl !== rawUrl ? ' (page-url)' : ''}`,
      requestId: context?.requestId,
      dispatchId: context?.dispatchId,
      traceId: context?.traceId,
      spanId: context?.spanId,
      roomId: context?.roomId,
      userId: context?.userId,
      meta: { url: lensTargetUrl, mediaUrl: rawUrl },
    });

    const result = await lensClient.capture(lensTargetUrl, socket, toCorrelationContext(context));

    const vType = result.mediaType === 'hls' ? 'm3u8' : 'mp4';
    const lensPlaybackUrl = buildLensPlaybackUrl(result.uuid);
    const needsPicker = result.lowConfidence || result.ambiguous;

    stopTimer();
    recordDispatchOutcome('set-video', 'success');
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
  } catch (error) {
    // Categorize error type for metrics
    if (error instanceof ValidationError) {
      recordDispatchError('set-video', 'validation-error');
    } else if (error instanceof Error && error.message.includes('timeout')) {
      recordDispatchError('set-video', 'timeout');
    } else {
      recordDispatchError('set-video', 'upstream-error');
    }
    throw error;
  }
}

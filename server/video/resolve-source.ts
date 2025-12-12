export interface RoomVideoMeta {
  originalUrl: string;
  playbackUrl: string;
  deliveryType: 'youtube' | 'file-direct' | 'file-proxy' | 'hls';
  videoType: 'youtube' | 'mp4' | 'm3u8' | null; // Legacy compatibility
  containerHint?: string;
  codecWarning?: string;
  requiresProxy: boolean;
  decisionReasons: string[];
  probe: { status: number; contentType?: string; acceptRanges?: boolean };
  timestamp: number;
}

interface ProbeResult {
  status: number;
  contentType?: string;
  acceptRanges?: boolean;
  bytes?: Uint8Array;
  error?: string;
}

function classify(url: string): {
  kind: 'youtube' | 'hls' | 'file';
  videoType: RoomVideoMeta['videoType'];
  hints: { hlsPath?: boolean; extensionless?: boolean; signedQuery?: boolean };
} {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();
    const pathname = u.pathname.toLowerCase();
    const search = u.search.toLowerCase();

    if (/youtu\.be|youtube\.com/.test(hostname)) {
      return { kind: 'youtube', videoType: 'youtube', hints: {} };
    }

    const hlsPath =
      /\.m3u8(\?.*)?$/i.test(pathname) ||
      pathname.includes('/hls/') ||
      pathname.includes('master.m3u8') ||
      pathname.includes('manifest.m3u8') ||
      pathname.includes('/live/');

    if (hlsPath) {
      return { kind: 'hls', videoType: 'm3u8', hints: { hlsPath } };
    }

    const extensionless = !(pathname.split('/').pop() || '').includes('.');
    const signedQuery = /(?:token|signature|sig|expires|expiry|exp)=/i.test(search);

    return { kind: 'file', videoType: null, hints: { hlsPath, extensionless, signedQuery } };
  } catch {
    return { kind: 'file', videoType: null, hints: {} };
  }
}

async function headRequest(url: string, signal: AbortSignal): Promise<ProbeResult> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal });
    return {
      status: res.status,
      contentType: res.headers.get('content-type') || undefined,
      acceptRanges: res.headers.get('accept-ranges')?.includes('bytes'),
    };
  } catch (e) {
    return { status: 0, error: (e as Error).message };
  }
}

async function rangeProbe(url: string, signal: AbortSignal): Promise<ProbeResult> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1023' },
      redirect: 'follow',
      signal,
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    return {
      status: res.status,
      contentType: res.headers.get('content-type') || undefined,
      acceptRanges: res.headers.get('accept-ranges')?.includes('bytes'),
      bytes,
    };
  } catch (e) {
    return { status: 0, error: (e as Error).message };
  }
}

function sniffContainer(bytes?: Uint8Array): string | undefined {
  if (!bytes || bytes.length < 12) return undefined;
  if (bytes.slice(4, 8).toString() === 'ftyp') return 'mp4';
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm';
  if (bytes[0] === 0x47 && bytes[188] === 0x47) return 'ts';
  return undefined;
}

function inferCodecWarning(containerHint?: string, bytes?: Uint8Array): string | undefined {
  if (!bytes) return undefined;
  // Quick heuristic for HEVC brand markers in ftyp
  const ascii = new TextDecoder().decode(bytes.slice(0, 64));
  if (containerHint === 'mp4' && /hvc1|hev1/.test(ascii)) {
    return 'Likely HEVC (hvc1/hev1) – may not play on some browsers.';
  }
  return undefined;
}

export async function resolveSource(rawUrl: string): Promise<RoomVideoMeta> {
  const originalUrl = rawUrl.trim();
  const decisionReasons: string[] = [];
  const protocol = new URL(originalUrl).protocol;
  if (!['http:', 'https:'].includes(protocol)) {
    decisionReasons.push('protocol-unsupported');
    throw new Error('Unsupported protocol');
  }

  const { kind, videoType: legacyVideoType, hints } = classify(originalUrl);
  const timestamp = Date.now();

  if (hints.hlsPath) decisionReasons.push('hls-path-hint');
  if (hints.extensionless) decisionReasons.push('url-extensionless');
  if (hints.signedQuery) decisionReasons.push('url-signed');

  // Simple direct classifications first
  if (kind === 'youtube') {
    decisionReasons.push('youtube-detected');
    return {
      originalUrl,
      playbackUrl: originalUrl,
      deliveryType: 'youtube',
      videoType: 'youtube',
      requiresProxy: false,
      decisionReasons,
      probe: { status: 0 },
      timestamp,
    };
  }
  if (kind === 'hls') {
    decisionReasons.push('hls-manifest');
    return {
      originalUrl,
      playbackUrl: originalUrl,
      deliveryType: 'hls',
      videoType: 'm3u8',
      requiresProxy: false,
      decisionReasons,
      probe: { status: 0 },
      timestamp,
    };
  }

  // File: perform HEAD then Range probe if needed
  const controller = new AbortController();
  const head = await headRequest(originalUrl, controller.signal);
  if (head.status === 403 || head.status === 401) {
    decisionReasons.push('head-access-denied');
    const meta: RoomVideoMeta = {
      originalUrl,
      playbackUrl: `/api/video-proxy?url=${encodeURIComponent(originalUrl)}`,
      deliveryType: 'file-proxy',
      videoType: legacyVideoType,
      requiresProxy: true,
      decisionReasons,
      probe: { status: head.status, contentType: head.contentType, acceptRanges: head.acceptRanges },
      timestamp,
    };
    return meta;
  }

  let range: ProbeResult | undefined;
  if (head.status === 200 || head.status === 206) {
    decisionReasons.push('head-success');

    const contentType = head.contentType?.toLowerCase();
    if (contentType?.includes('application/vnd.apple.mpegurl') || contentType?.includes('application/x-mpegurl')) {
      decisionReasons.push('hls-content-type');
      return {
        originalUrl,
        playbackUrl: originalUrl,
        deliveryType: 'hls',
        videoType: 'm3u8',
        requiresProxy: false,
        decisionReasons,
        probe: { status: head.status, contentType: head.contentType, acceptRanges: head.acceptRanges },
        timestamp,
      };
    }

    const shouldProbe =
      !head.contentType ||
      /octet-stream|application\//i.test(head.contentType) ||
      head.contentType.startsWith('audio/') ||
      head.contentType.startsWith('video/');

    if (shouldProbe) {
      range = await rangeProbe(originalUrl, controller.signal);
      decisionReasons.push('range-probed');
      if (range.status === 403) {
        decisionReasons.push('range-access-denied');
        return {
          originalUrl,
          playbackUrl: `/api/video-proxy?url=${encodeURIComponent(originalUrl)}`,
          deliveryType: 'file-proxy',
          videoType: legacyVideoType,
          requiresProxy: true,
          decisionReasons,
          probe: { status: range.status, contentType: range.contentType, acceptRanges: range.acceptRanges },
          timestamp,
        };
      }
    }
  } else {
    decisionReasons.push(head.status === 0 ? 'head-failed' : 'head-non-200');
  }

  const containerHint = sniffContainer(range?.bytes);
  if (containerHint) decisionReasons.push(`container-${containerHint}`);
  const codecWarning = inferCodecWarning(containerHint, range?.bytes);
  if (codecWarning) decisionReasons.push('codec-warning');

  const directLikely =
    (head.status === 200 || head.status === 206) &&
    (head.contentType?.startsWith('video/') || head.contentType?.startsWith('audio/') || !!containerHint);

  if (directLikely) {
    decisionReasons.push('direct-playable');
    return {
      originalUrl,
      playbackUrl: originalUrl,
      deliveryType: 'file-direct',
      videoType: legacyVideoType || (containerHint === 'mp4' ? 'mp4' : null),
      containerHint,
      codecWarning,
      requiresProxy: false,
      decisionReasons,
      probe: { status: head.status, contentType: head.contentType, acceptRanges: head.acceptRanges },
      timestamp,
    };
  }

  decisionReasons.push('fallback-proxy');
  return {
    originalUrl,
    playbackUrl: `/api/video-proxy?url=${encodeURIComponent(originalUrl)}`,
    deliveryType: 'file-proxy',
    videoType: legacyVideoType,
    containerHint,
    codecWarning,
    requiresProxy: true,
    decisionReasons,
    probe: { status: head.status, contentType: head.contentType, acceptRanges: head.acceptRanges },
    timestamp,
  };
}

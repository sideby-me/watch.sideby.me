import { NextRequest, NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import ip from 'ip';

// Basic allowlist and validation to prevent SSRF
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// Disallowed hostnames (immediately rejected before DNS)
const DISALLOWED_HOST_PATTERNS: RegExp[] = [/^(?:localhost|ip6-localhost)$/i, /\.local$/i];

function isHostnameDisallowed(host: string, allowLocal: boolean) {
  if (allowLocal) return false;
  if (host === '0.0.0.0') return true;
  return DISALLOWED_HOST_PATTERNS.some(re => re.test(host));
}

function isPrivateAddress(address: string, allowLocal: boolean): boolean {
  if (allowLocal) return false;
  if (ip.isPrivate(address)) return true;
  if (address === '127.0.0.1' || address === '::1') return true;
  if (address.startsWith('127.')) return true;
  if (address.startsWith('169.254.')) return true; // IPv4 link-local
  if (address === '0.0.0.0') return true;
  const lower = address.toLowerCase();
  if (lower.startsWith('fe80:')) return true; // IPv6 link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // IPv6 unique local (should already be caught by ip.isPrivate but explicit)
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true; // unspecified
  return false;
}

async function resolveAndValidate(u: URL, allowLocal: boolean): Promise<URL | null> {
  if (!ALLOWED_PROTOCOLS.has(u.protocol)) return null;
  const host = u.hostname;
  if (isHostnameDisallowed(host, allowLocal)) return null;

  // If direct IP literal, validate immediately.
  if (net.isIP(host)) {
    if (isPrivateAddress(host, allowLocal)) return null;
    return u;
  }

  // DNS lookup (A/AAAA) we restrict number of records examined.
  let records: { address: string }[] = [];
  try {
    records = await lookup(host, { all: true, verbatim: false });
  } catch (_e) {
    return null; // DNS failure -> treat as invalid
  }
  if (!records.length) return null;
  // Reject if any resolved address is private for prevents dual-homed / DNS rebinding scenarios.
  for (const r of records) {
    if (isPrivateAddress(r.address, allowLocal)) return null;
  }
  return u;
}

async function getSafeReferer(raw: string | null, target: URL, allowLocal: boolean): Promise<string | null> {
  if (!raw) return null;
  try {
    const ref = new URL(raw);
    const validated = await resolveAndValidate(ref, allowLocal);
    if (!validated) return null;

    // Prevent referer pointing to private IPs or non-http(s)
    // If the referer shares the same registrable host or protocol, allow it; otherwise ensure it is still public
    const refererHost = validated.hostname;
    const targetHost = target.hostname;
    if (refererHost === targetHost || validated.protocol === target.protocol) {
      return validated.toString();
    }

    return validated.toString();
  } catch (_e) {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('url');
  if (!target) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  const parsed = (() => {
    try {
      return new URL(target);
    } catch {
      return null;
    }
  })();
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Allow loopback/localhost targets during local development or when matching the current origin.
  const isSameHost = parsed.hostname === req.nextUrl.hostname;
  const allowLocal = process.env.NODE_ENV !== 'production' || isSameHost;

  const validated = await resolveAndValidate(parsed, allowLocal);
  if (!validated) {
    return NextResponse.json({ error: 'Invalid or disallowed URL' }, { status: 400 });
  }

  const safeReferer = await getSafeReferer(req.nextUrl.searchParams.get('referer'), validated, allowLocal);

  // Forward Range if present (hotlink protection sometimes rejects, we fallback if 403).
  const range = req.headers.get('range');

  const forwardHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; SidebyProxy/1.0)',
  };
  if (range) forwardHeaders['Range'] = range;
  // Provide a referer derived from user hint (validated) or original target origin to satisfy naive hotlink checks
  const refererHeader = safeReferer || `${validated.origin}/`;
  forwardHeaders['Referer'] = refererHeader;
  forwardHeaders['Origin'] = new URL(refererHeader).origin;
  forwardHeaders['Accept'] = '*/*';

  const controller = new AbortController();
  // Tie abort to client signal if available (edge runtime exposes signal on request)
  const clientSignal: AbortSignal | undefined = (req as unknown as { signal?: AbortSignal }).signal;
  clientSignal?.addEventListener('abort', () => controller.abort());

  const doFetch = async (useRange: boolean) => {
    const headers = { ...forwardHeaders };
    if (!useRange) delete headers['Range'];
    return fetch(validated.toString(), { headers, redirect: 'follow', signal: controller.signal });
  };

  let upstream: Response;
  try {
    // First attempt (with range if provided)
    upstream = await doFetch(!!range);

    // If a 403 and we used Range, retry without Range (some WAFs block mid-file byte ranges)
    if (upstream.status === 403 && range) {
      upstream = await doFetch(false);
    }

    // If upstream blocks due to referer/origin, retry once with minimal headers (no referer/origin/range)
    if (
      upstream.status === 401 ||
      upstream.status === 403 ||
      upstream.status === 502 ||
      upstream.status === 503 ||
      upstream.status === 504
    ) {
      const minimalHeaders = { 'User-Agent': forwardHeaders['User-Agent'], Accept: '*/*' };
      upstream = await fetch(validated.toString(), {
        headers: minimalHeaders,
        redirect: 'follow',
        signal: controller.signal,
      });
    }
  } catch (fetchError) {
    const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown fetch error';
    console.error('[video-proxy] Fetch error:', errorMessage, 'URL:', validated.toString().slice(0, 200));
    return NextResponse.json(
      { error: 'Failed to fetch upstream video', detail: errorMessage },
      {
        status: 502,
        headers: {
          'x-proxy-reason': 'fetch-error',
          'x-proxy-error': errorMessage.slice(0, 100),
        },
      }
    );
  }

  if (!upstream.ok && upstream.status !== 206) {
    const headers = new Headers({
      'x-proxy-reason': 'upstream-error',
      'x-proxy-origin-status': String(upstream.status),
    });
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  }

  // Prepare response headers
  const headers = new Headers();
  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  headers.set('Content-Type', contentType);

  const loweredType = contentType.toLowerCase();
  const isM3U8 =
    loweredType.includes('application/vnd.apple.mpegurl') ||
    loweredType.includes('application/x-mpegurl') ||
    loweredType.includes('audio/mpegurl') ||
    validated.pathname.toLowerCase().includes('.m3u8');

  // Only rewrite when the client is proxying (so relative segment URIs resolve correctly)
  if (isM3U8) {
    const proxify = (uri: string) => `/api/video-proxy?url=${encodeURIComponent(uri)}`;

    const rewriteM3U8 = (manifest: string) => {
      const lines = manifest.split(/\r?\n/);
      return lines
        .map(line => {
          const trimmed = line.trim();
          if (!trimmed) return line;

          if (trimmed.startsWith('#EXT-X-KEY') || trimmed.startsWith('#EXT-X-MAP')) {
            return line.replace(/URI="([^"]+)"/i, (_m, uri) => {
              try {
                const absolute = new URL(uri, validated).toString();
                return `URI="${proxify(absolute)}"`;
              } catch {
                return line;
              }
            });
          }

          if (trimmed.startsWith('#')) return line;

          try {
            const absolute = new URL(trimmed, validated).toString();
            return proxify(absolute);
          } catch {
            return line;
          }
        })
        .join('\n');
    };

    try {
      const manifestText = await upstream.text();
      const rewritten = rewriteM3U8(manifestText);

      headers.set('Content-Type', 'application/vnd.apple.mpegurl');
      headers.set('Cache-Control', upstream.headers.get('cache-control') || 'public, max-age=300');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Vary', 'Origin');
      headers.set('x-proxy-origin-status', String(upstream.status));
      headers.set('x-proxy-reason', 'm3u8-rewrite');

      return new NextResponse(rewritten, { status: upstream.status === 206 ? 200 : upstream.status, headers });
    } catch (_e) {
      // fall through to regular streaming
    }
  }

  // Security: strip set-cookie
  const contentLengthHeader = upstream.headers.get('content-length');
  const maxAllowed = 5 * 1024 * 1024 * 1024; // 5GB soft cap
  if (contentLengthHeader) {
    const cl = parseInt(contentLengthHeader, 10);
    if (!isNaN(cl) && cl > maxAllowed) {
      return NextResponse.json(
        { error: 'File too large', status: 413 },
        { status: 413, headers: { 'x-proxy-reason': 'size-limit' } }
      );
    }
  }

  const acceptRanges = upstream.headers.get('accept-ranges');
  if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);
  const cacheControl = upstream.headers.get('cache-control') || 'public, max-age=3600';
  headers.set('Cache-Control', cacheControl);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Vary', 'Origin, Range');

  headers.set('x-proxy-origin-status', String(upstream.status));

  // Range synthesis logic
  const requestedRange = range;
  if (requestedRange && upstream.status === 200 && acceptRanges?.includes('bytes') && upstream.body) {
    const m = requestedRange.match(/bytes=(\d+)-(\d+)?/);
    if (m) {
      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : start + 1024 * 1024 - 1; // default 1MB window if open-ended
      const chunkSize = end - start + 1;
      if (chunkSize > 0 && chunkSize <= 8 * 1024 * 1024) {
        // Stream and slice manually without buffering entire chunk in memory
        const reader = upstream.body.getReader();
        let offset = 0;
        let collected = 0;
        const ts = new TransformStream();
        const writer = ts.writable.getWriter();
        (async () => {
          try {
            while (collected < chunkSize) {
              const { done, value } = await reader.read();
              if (done) break;
              if (!value) continue;
              const valEnd = offset + value.length;
              if (valEnd > start && offset <= end) {
                const sliceStart = Math.max(0, start - offset);
                const sliceEnd = Math.min(value.length, end - offset + 1);
                const slice = value.subarray(sliceStart, sliceEnd);
                collected += slice.length;
                await writer.write(slice);
                if (collected >= chunkSize) break;
              }
              offset = valEnd;
              if (offset > end) break;
            }
          } catch (_e) {
            // swallow errors
          } finally {
            try {
              await writer.close();
            } catch {}
          }
        })();

        headers.set('Content-Type', contentType);
        headers.set('Content-Range', `bytes ${start}-${start + collected - 1}/${contentLengthHeader || '*'}`);
        headers.set('x-proxy-reason', 'range-synthesized');
        // No Content-Length to allow streaming; clients handle chunked
        return new NextResponse(ts.readable, { status: 206, headers });
      } else {
        headers.set('x-proxy-reason', 'range-too-large');
      }
    }
  }

  // Pass-through standard behavior
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) headers.set('Content-Range', contentRange);
  const status = upstream.status === 206 ? 206 : 200;
  headers.set('x-proxy-reason', headers.get('x-proxy-reason') || 'pass-through');
  return new NextResponse(upstream.body, { status, headers });
}

export const runtime = 'nodejs';

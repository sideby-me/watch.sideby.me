import { NextRequest, NextResponse } from 'next/server';
import { resolveSource } from '@/server/video/resolve-source';
import { logVideoEvent } from '@/server/logger';
import { createRateLimiter } from '@/server/rate-limiter';

// 20 requests per minute per IP for video resolution.
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Rate limit by client IP.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const rl = limiter.check(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 1000) / 1000)),
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  let url: string | undefined;
  try {
    const body = await req.json();
    url = body.url;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid url' }, { status: 400 });
    }

    // Basic protocol check
    const protocol = new URL(url).protocol;
    if (!['http:', 'https:'].includes(protocol)) {
      return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
    }

    const meta = await resolveSource(url);

    // Log preflight resolution result
    logVideoEvent({
      level: 'info',
      event: 'preflight-resolve',
      message: `Resolved video source -> ${meta.deliveryType}`,
      meta: {
        deliveryType: meta.deliveryType,
        requiresProxy: meta.requiresProxy,
        confidence: meta.confidence,
        confidenceReason: meta.confidenceReason,
      },
    });

    const response = NextResponse.json({ meta });
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'Unsupported protocol') {
      return NextResponse.json(
        { error: 'Unsupported protocol' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    if (error instanceof Error && error.message.startsWith('URL is blocked')) {
      return NextResponse.json(
        { error: 'This URL cannot be used.' },
        { status: 403, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Log playback error
    logVideoEvent({
      level: 'error',
      event: 'preflight-error',
      message: error instanceof Error ? error.message : 'Unknown resolve error',
      meta: { error },
    });
    return NextResponse.json(
      { error: 'Failed to resolve video source' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

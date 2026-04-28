import { NextRequest, NextResponse } from 'next/server';
import { logVideoEvent } from '@/src/lib/logger';
import { createRateLimiter } from '@/src/lib/rate-limiter';
import { isBlocked } from '@/src/lib/video/blocklist';

// 20 requests per minute per IP for video pre-validation.
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

    // Protocol check
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json(
        { error: 'Only http/https video links are supported' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Blocklist check
    const blockCheck = isBlocked(url);
    if (blockCheck.blocked) {
      return NextResponse.json(
        { error: 'This URL cannot be used.' },
        { status: 403, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    logVideoEvent({
      level: 'info',
      event: 'preflight-validate',
      message: 'URL pre-validated (dispatch happens server-side over socket)',
      meta: { url },
    });

    // Return stable meta shape - callers key on `meta.deliveryType`
    const response = NextResponse.json({
      meta: {
        deliveryType: 'unknown',
        playbackUrl: url,
        requiresProxy: false,
      },
    });
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Invalid URL')) {
      return NextResponse.json(
        { error: 'Invalid URL' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    logVideoEvent({
      level: 'error',
      event: 'preflight-error',
      message: error instanceof Error ? error.message : 'Unknown preflight error',
      meta: { error },
    });
    return NextResponse.json(
      { error: 'Failed to validate video URL' },
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

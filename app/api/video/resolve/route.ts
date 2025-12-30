import { NextRequest, NextResponse } from 'next/server';
import { resolveSource } from '@/server/video/resolve-source';
import { logVideoEvent } from '@/server/logger';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
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
      source: 'preflight',
      testedUrl: url,
      playbackUrl: meta.playbackUrl,
      deliveryType: meta.deliveryType,
      requiresProxy: meta.requiresProxy,
      confidence: meta.confidence,
      confidenceReason: meta.confidenceReason,
      decisionReasons: meta.decisionReasons,
      probe: meta.probe,
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

    // Log playback error
    logVideoEvent({
      source: 'playback-error',
      testedUrl: url,
      error: error instanceof Error ? error.message : 'Unknown',
    });

    console.error('Video resolve error:', error);
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

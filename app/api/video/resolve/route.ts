import { NextRequest, NextResponse } from 'next/server';
import { resolveSource } from '@/server/video/resolve-source';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid url' }, { status: 400 });
    }

    // Basic protocol check
    const protocol = new URL(url).protocol;
    if (!['http:', 'https:'].includes(protocol)) {
      return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
    }

    const meta = await resolveSource(url);
    return NextResponse.json({ meta });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unsupported protocol') {
      return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
    }

    console.error('Video resolve error:', error);
    return NextResponse.json({ error: 'Failed to resolve video source' }, { status: 500 });
  }
}

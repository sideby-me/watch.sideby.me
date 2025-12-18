import { NextRequest, NextResponse } from 'next/server';
import { SubtitleDownloadResponse } from '@/types';

const OPENSUBTITLES_API_URL = 'https://api.opensubtitles.com/api/v1';

export async function GET(req: NextRequest) {
  const apiKey = process.env.OPENSUBTITLES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Subtitle search is not configured' },
      { status: 500 }
    );
  }

  const fileId = req.nextUrl.searchParams.get('fileId');

  // Validate fileId parameter
  if (!fileId || fileId.trim().length === 0) {
    return NextResponse.json(
      { error: 'File ID is required' },
      { status: 400 }
    );
  }

  try {
    // First, request a download link from OpenSubtitles
    const downloadLinkResponse = await fetch(
      `${OPENSUBTITLES_API_URL}/download`,
      {
        method: 'POST',
        headers: {
          'Api-Key': apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'SideBy v1.0',
        },
        body: JSON.stringify({ file_id: parseInt(fileId, 10) }),
      }
    );

    if (!downloadLinkResponse.ok) {
      if (downloadLinkResponse.status === 404) {
        return NextResponse.json(
          { error: 'Subtitle file not found' },
          { status: 404 }
        );
      }
      if (downloadLinkResponse.status === 429) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait a moment and try again.' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: 'Subtitle service unavailable' },
        { status: 502 }
      );
    }

    const downloadData = await downloadLinkResponse.json();
    const downloadLink = downloadData.link;
    const filename = downloadData.file_name || 'subtitle.srt';

    if (!downloadLink) {
      return NextResponse.json(
        { error: 'Failed to get download link' },
        { status: 502 }
      );
    }

    // Fetch the actual subtitle file
    const subtitleResponse = await fetch(downloadLink);

    if (!subtitleResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to download subtitle file' },
        { status: 502 }
      );
    }

    const content = await subtitleResponse.text();
    const format = filename.split('.').pop()?.toLowerCase() || 'srt';

    const response: SubtitleDownloadResponse = {
      content,
      format,
      filename,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('OpenSubtitles download error:', error);
    return NextResponse.json(
      { error: 'Subtitle service unavailable' },
      { status: 502 }
    );
  }
}

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import {
  OpenSubtitlesAPIResponse,
  OpenSubtitlesAPIResponseSchema,
  OpenSubtitlesResult,
  SubtitleSearchResponse,
} from '@/types';

const OPENSUBTITLES_API_URL = 'https://api.opensubtitles.com/api/v1';

// Retry configuration for transient network errors
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 100; // ms

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error as Error;
      const isRetryable = error instanceof Error && (error.cause as { code?: string })?.code === 'ECONNRESET';

      if (!isRetryable || attempt === retries - 1) {
        throw error;
      }

      // Exponential backoff
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Language code to full name mapping
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  ru: 'Russian',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  cs: 'Czech',
  el: 'Greek',
  he: 'Hebrew',
  hu: 'Hungarian',
  ro: 'Romanian',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  hi: 'Hindi',
  bn: 'Bengali',
  uk: 'Ukrainian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sk: 'Slovak',
  sl: 'Slovenian',
  sr: 'Serbian',
  et: 'Estonian',
  lv: 'Latvian',
  lt: 'Lithuanian',
};

function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] || code.toUpperCase();
}

function getFormatFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext || 'srt';
}

function mapToResult(apiItem: OpenSubtitlesAPIResponse['data'][0]): OpenSubtitlesResult {
  const file = apiItem.attributes.files[0];
  return {
    id: apiItem.id,
    fileId: String(file.file_id),
    language: apiItem.attributes.language,
    languageName: getLanguageName(apiItem.attributes.language),
    releaseName: apiItem.attributes.release || file.file_name,
    downloadCount: apiItem.attributes.download_count,
    format: getFormatFromFilename(file.file_name),
    fps: apiItem.attributes.fps ?? null,
    hearingImpaired: apiItem.attributes.hearing_impaired,
  };
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.OPENSUBTITLES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Subtitle search is not configured' }, { status: 500 });
  }

  const query = req.nextUrl.searchParams.get('query');
  const language = req.nextUrl.searchParams.get('language');

  // Validate query - reject empty or whitespace-only queries
  if (!query || query.trim().length === 0) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
  }

  const searchParams = new URLSearchParams({
    query: query.trim(),
  });

  if (language) {
    searchParams.set('languages', language);
  }

  try {
    const response = await fetchWithRetry(`${OPENSUBTITLES_API_URL}/subtitles?${searchParams.toString()}`, {
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'SideBy v1.0',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json({ error: 'Subtitle search is not configured' }, { status: 500 });
      }
      if (response.status === 429) {
        return NextResponse.json({ error: 'Too many requests. Please wait a moment and try again.' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Subtitle service unavailable' }, { status: 502 });
    }

    const data = await response.json();

    // Validate and parse the API response
    const parseResult = OpenSubtitlesAPIResponseSchema.safeParse(data);
    if (!parseResult.success) {
      console.error('OpenSubtitles API response validation failed:', parseResult.error);
      return NextResponse.json({ error: 'Subtitle service unavailable' }, { status: 502 });
    }

    const apiResponse = parseResult.data;

    // Filter out items without files and map to internal types
    const results: OpenSubtitlesResult[] = apiResponse.data
      .filter(item => item.attributes.files.length > 0)
      .map(mapToResult);

    const searchResponse: SubtitleSearchResponse = {
      results,
      totalCount: apiResponse.total_count,
    };

    return NextResponse.json(searchResponse);
  } catch (error) {
    console.error('OpenSubtitles API error:', error);
    return NextResponse.json({ error: 'Subtitle service unavailable' }, { status: 502 });
  }
}

export const runtime = 'nodejs';

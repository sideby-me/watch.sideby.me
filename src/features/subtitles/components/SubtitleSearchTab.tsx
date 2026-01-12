'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, Download, AlertCircle, RefreshCw, Filter, X } from 'lucide-react';
import type { OpenSubtitlesResult, SubtitleTrack, SubtitleSearchResponse } from '@/types';

interface SubtitleSearchTabProps {
  onSubtitleSelected: (track: SubtitleTrack) => void;
}

interface SubtitleSearchState {
  query: string;
  results: OpenSubtitlesResult[];
  isLoading: boolean;
  error: string | null;
  languageFilter: string | null;
  downloadingId: string | null;
  hasSearched: boolean;
}

export function SubtitleSearchTab({ onSubtitleSelected }: SubtitleSearchTabProps) {
  const [state, setState] = useState<SubtitleSearchState>({
    query: '',
    results: [],
    isLoading: false,
    error: null,
    languageFilter: null,
    downloadingId: null,
    hasSearched: false,
  });

  const searchSubtitles = useCallback(async () => {
    const trimmedQuery = state.query.trim();
    if (!trimmedQuery) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const params = new URLSearchParams({ query: trimmedQuery });
      const response = await fetch(`/api/subtitles/search?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to search subtitles');
      }

      const data: SubtitleSearchResponse = await response.json();

      // Sort results by download count (popularity) descending
      const sortedResults = [...data.results].sort((a, b) => b.downloadCount - a.downloadCount);

      setState(prev => ({
        ...prev,
        results: sortedResults,
        isLoading: false,
        languageFilter: null,
        hasSearched: true,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'The search connection timed out. The internet gremlins are at it again.',
      }));
    }
  }, [state.query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchSubtitles();
  };

  const handleRetry = () => {
    searchSubtitles();
  };

  // Get unique languages from results for filter dropdown
  const availableLanguages = Array.from(new Set(state.results.map(r => r.language)))
    .map(code => {
      const result = state.results.find(r => r.language === code);
      return { code, name: result?.languageName || code };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Filter results by selected language
  const filteredResults = state.languageFilter
    ? state.results.filter(r => r.language === state.languageFilter)
    : state.results;

  const setLanguageFilter = (language: string | null) => {
    setState(prev => ({ ...prev, languageFilter: language }));
  };

  const formatDownloadCount = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <div className="space-y-4">
      {/* Search Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="text"
          placeholder="What are we watching? (e.g. The Matrix)"
          value={state.query}
          onChange={e => setState(prev => ({ ...prev, query: e.target.value }))}
          className="flex-1"
          disabled={state.isLoading}
        />
        <Button type="submit" disabled={state.isLoading || !state.query.trim()}>
          {state.isLoading ? <Spinner variant="circle" className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          <span className="ml-2 hidden sm:inline">Find Tracks</span>
        </Button>
      </form>

      {/* Loading State */}
      {state.isLoading && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Spinner variant="circle" className="mb-2 h-8 w-8" />
          {/* Active voice */}
          <p>Scouring the archives...</p>
        </div>
      )}

      {/* Error State */}
      {state.error && !state.isLoading && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
          <p className="mb-4 text-destructive">{state.error}</p>
          <Button variant="outline" onClick={handleRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Give it another shot
          </Button>
        </div>
      )}

      {/* No Results State */}
      {!state.isLoading && !state.error && state.results.length === 0 && state.hasSearched && (
        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
          <Search className="mb-2 h-8 w-8 opacity-50" />
          <p className="mb-2">We came up empty for &quot;{state.query}&quot;.</p>
          <p className="text-sm">Maybe check the spelling or try a simpler title?</p>
        </div>
      )}

      {/* Results */}
      {!state.isLoading && !state.error && state.results.length > 0 && (
        <div className="space-y-4">
          {/* Language Filter */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Found {filteredResults.length} match{filteredResults.length !== 1 ? 'es' : ''}
              {state.languageFilter && ` in ${availableLanguages.find(l => l.code === state.languageFilter)?.name}`}
            </p>
            <div className="flex items-center gap-2">
              {state.languageFilter && (
                <Button variant="ghost" size="sm" onClick={() => setLanguageFilter(null)} className="h-8 px-2">
                  <X className="mr-1 h-3 w-3" />
                  Show all
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <Filter className="mr-1 h-3 w-3" />
                    {state.languageFilter
                      ? availableLanguages.find(l => l.code === state.languageFilter)?.name
                      : 'Filter Language'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-60 overflow-y-auto">
                  {availableLanguages.map(lang => (
                    <DropdownMenuItem key={lang.code} onClick={() => setLanguageFilter(lang.code)}>
                      {lang.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Results List */}
          <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
            {filteredResults.map(result => (
              <SubtitleResultItem
                key={result.id}
                result={result}
                isDownloading={state.downloadingId === result.id}
                onSelect={onSubtitleSelected}
                onDownloadStart={() => setState(prev => ({ ...prev, downloadingId: result.id }))}
                onDownloadEnd={() => setState(prev => ({ ...prev, downloadingId: null }))}
                formatDownloadCount={formatDownloadCount}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface SubtitleResultItemProps {
  result: OpenSubtitlesResult;
  isDownloading: boolean;
  onSelect: (track: SubtitleTrack) => void;
  onDownloadStart: () => void;
  onDownloadEnd: () => void;
  formatDownloadCount: (count: number) => string;
}

function SubtitleResultItem({
  result,
  isDownloading,
  onSelect,
  onDownloadStart,
  onDownloadEnd,
  formatDownloadCount,
}: SubtitleResultItemProps) {
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setError(null);
    onDownloadStart();

    try {
      const params = new URLSearchParams({ fileId: result.fileId });
      const response = await fetch(`/api/subtitles/download?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to download subtitle');
      }

      const data = await response.json();

      // Import SubtitleParser dynamically to avoid SSR issues
      const { SubtitleParser } = await import('@/lib/subtitle-utils');

      // Parse the subtitle content based on format
      let cues;
      if (data.format === 'vtt') {
        cues = SubtitleParser.parseVTT(data.content);
      } else if (data.format === 'srt') {
        cues = SubtitleParser.parseSRT(data.content);
      } else if (data.format === 'ass') {
        cues = SubtitleParser.parseASS(data.content);
      } else {
        // Default to SRT parsing
        cues = SubtitleParser.parseSRT(data.content);
      }

      // Convert to VTT and create blob URL
      const blobUrl = SubtitleParser.createBlobUrl(cues);

      const track: SubtitleTrack = {
        id: `opensubtitles-${result.id}-${Date.now()}`,
        label: result.releaseName || `${result.languageName} Subtitle`,
        language: result.language,
        url: blobUrl,
        format: 'vtt',
        isDefault: false,
      };

      onSelect(track);
    } catch (err) {
      // On-brand error
      setError(err instanceof Error ? err.message : 'Failed to grab that file. Mind trying another one?');
    } finally {
      onDownloadEnd();
    }
  };

  return (
    <div className="rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={result.releaseName}>
            {result.releaseName}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {result.languageName}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {result.format.toUpperCase()}
            </Badge>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Download className="h-3 w-3" />
              {formatDownloadCount(result.downloadCount)}
            </span>
            {result.hearingImpaired && (
              <Badge variant="outline" className="text-xs">
                CC
              </Badge>
            )}
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={isDownloading} className="shrink-0">
          {isDownloading ? (
            <>
              <Spinner variant="circle" className="mr-1 h-3 w-3" />
              Grabbing...
            </>
          ) : (
            <>
              <Download className="mr-1 h-3 w-3" />
              Use This
            </>
          )}
        </Button>
      </div>
      {error && (
        <Button variant="ghost" size="sm" onClick={handleDownload} className="mt-2 h-7 text-xs">
          <RefreshCw className="mr-1 h-3 w-3" />
          Retry
        </Button>
      )}
    </div>
  );
}

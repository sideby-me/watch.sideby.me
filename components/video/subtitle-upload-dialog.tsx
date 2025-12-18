'use client';

import { useState, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogHeader, DialogTitle, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, CheckCircle, X, XIcon, Search } from 'lucide-react';
import { SubtitleParser } from '@/lib/subtitle-utils';
import { useFullscreenPortalContainer } from '@/hooks/use-fullscreen-portal-container';
import { cn } from '@/lib/utils';
import { SubtitleSearchTab } from './subtitle-search-tab';
import type { SubtitleTrack } from '@/types/schemas';

interface SubtitleUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubtitleSelected: (tracks: SubtitleTrack[]) => void;
}

type TabType = 'upload' | 'search';

export function SubtitleUploadDialog({ open, onOpenChange, onSubtitleSelected }: SubtitleUploadDialogProps) {
  const [activeTab, setActiveTab] = useState<TabType>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedTracks, setProcessedTracks] = useState<SubtitleTrack[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const portalContainer = useFullscreenPortalContainer();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter(file => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return ['vtt', 'srt', 'ass'].includes(extension || '');
    });

    if (validFiles.length !== files.length) {
      alert('Heads-up: Some files were skipped because we can only process .vtt, .srt, and .ass subtitle formats.');
    }

    setUploadedFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    setProcessedTracks(prev => prev.filter((_, i) => i !== index));
  };

  const processFiles = async () => {
    if (uploadedFiles.length === 0) return;

    setIsProcessing(true);
    const tracks: SubtitleTrack[] = [];

    try {
      for (const file of uploadedFiles) {
        const extension = file.name.split('.').pop()?.toLowerCase();
        console.log(`Processing ${extension?.toUpperCase()} subtitle file:`, file.name);

        let url: string;

        if (extension === 'vtt') {
          // VTT files can be used directly
          url = URL.createObjectURL(file);
        } else {
          // Parse and convert SRT/ASS files to VTT
          const cues = await SubtitleParser.parseSubtitleFile(file);
          console.log(`Parsed ${cues.length} subtitle cues`);

          // Convert to VTT format and create blob URL
          url = SubtitleParser.createBlobUrl(cues);
        }

        // Try to detect language from filename
        const filename = file.name.toLowerCase();
        let language = 'unknown';
        if (filename.includes('.en.') || filename.includes('english')) language = 'en';
        else if (filename.includes('.es.') || filename.includes('spanish')) language = 'es';
        else if (filename.includes('.fr.') || filename.includes('french')) language = 'fr';
        else if (filename.includes('.de.') || filename.includes('german')) language = 'de';
        else if (filename.includes('.it.') || filename.includes('italian')) language = 'it';
        else if (filename.includes('.pt.') || filename.includes('portuguese')) language = 'pt';
        else if (filename.includes('.ru.') || filename.includes('russian')) language = 'ru';
        else if (filename.includes('.zh.') || filename.includes('chinese')) language = 'zh';
        else if (filename.includes('.ja.') || filename.includes('japanese')) language = 'ja';
        else if (filename.includes('.ko.') || filename.includes('korean')) language = 'ko';

        const track: SubtitleTrack = {
          id: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          label: file.name.replace(/\.[^/.]+$/, ''), // Remove extension from label
          language,
          url,
          format: 'vtt', // Always store as VTT since we convert
          isDefault: tracks.length === 0, // First track is default
        };

        tracks.push(track);
      }

      setProcessedTracks(tracks);
      console.log('Successfully processed subtitle files:', tracks);
    } catch (error) {
      console.error('Error processing subtitle files:', error);
      alert(
        'Oof, we hit our head trying to process one of your files. It might be corrupted. Could you check it and try again?'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddSubtitles = () => {
    if (processedTracks.length > 0) {
      onSubtitleSelected(processedTracks);

      // Give a small delay to allow the socket operation to complete
      // before closing the dialog and resetting state
      setTimeout(() => {
        onOpenChange(false);
        // Reset state
        setUploadedFiles([]);
        setProcessedTracks([]);
      }, 100);
    }
  };

  const handleSearchSubtitleSelected = (track: SubtitleTrack) => {
    onSubtitleSelected([track]);

    // Close dialog after selection
    setTimeout(() => {
      onOpenChange(false);
    }, 100);
  };

  const getLanguageLabel = (code: string) => {
    const languages: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      ru: 'Russian',
      zh: 'Chinese',
      ja: 'Japanese',
      ko: 'Korean',
      unknown: 'Unknown',
    };
    return languages[code] || code;
  };

  const getFileIcon = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase();
    if (extension === 'vtt') return '🎬';
    if (extension === 'srt') return '📝';
    if (extension === 'ass') return '🎭';
    return '📄';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal container={portalContainer}>
        <DialogOverlay />
        <DialogPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            'fixed left-[50%] top-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-hidden rounded-lg border bg-background p-0 shadow-lg duration-200 transition-interactive data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:max-w-lg'
          )}
        >
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="rounded-xs focus:outline-hidden absolute right-4 top-4 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle>Add Subtitles</DialogTitle>
          </DialogHeader>

          {/* Tab Navigation */}
          <div className="flex border-b px-6">
            <button
              onClick={() => setActiveTab('upload')}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                activeTab === 'upload'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground'
              )}
            >
              <Upload className="h-4 w-4" />
              Upload
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                activeTab === 'search'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground'
              )}
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {activeTab === 'upload' ? (
              <div className="space-y-4">
                {/* Upload Area */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Grab Your Subtitle Files</CardTitle>
                    <CardDescription>
                      Got a .vtt, .srt, or .ass file? We can handle those. You can even upload multiple at once.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div
                      className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-8 text-center transition-colors hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                      <p className="mb-2 text-lg font-medium">{`Click here to browse your collection...`}</p>
                      <p className="text-sm text-gray-500">{`...or just drag 'em right in here.`}</p>
                      <div className="mt-4 flex justify-center gap-2">
                        <Badge variant="outline">.vtt</Badge>
                        <Badge variant="outline">.srt</Badge>
                        <Badge variant="outline">.ass</Badge>
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".vtt,.srt,.ass"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </CardContent>
                </Card>

                {/* Selected Files */}
                {uploadedFiles.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Selected Files ({uploadedFiles.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {uploadedFiles.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-800"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <span className="text-2xl">{getFileIcon(file.name)}</span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium" title={file.name}>
                                  {file.name}
                                </p>
                                <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(index)}
                              className="ml-2 h-8 w-8 flex-shrink-0 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Processed Tracks */}
                {processedTracks.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        Ready to Add ({processedTracks.length} tracks)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {processedTracks.map((track, _index) => (
                          <div
                            key={track.id}
                            className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-500" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium" title={track.label}>
                                  {track.label}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {getLanguageLabel(track.language)}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {track.format.toUpperCase()}
                                  </Badge>
                                  {track.isDefault && <Badge className="bg-blue-500 text-xs">Default</Badge>}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Upload Tab Actions */}
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Never mind
                  </Button>
                  <div className="flex gap-2">
                    {uploadedFiles.length > 0 && processedTracks.length === 0 && (
                      <Button onClick={processFiles} disabled={isProcessing}>
                        {isProcessing ? (
                          <>
                            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <FileText className="mr-2 h-4 w-4" />
                            Process Files
                          </>
                        )}
                      </Button>
                    )}
                    {processedTracks.length > 0 && (
                      <Button onClick={handleAddSubtitles}>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Add Subtitles
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="pt-2">
                <SubtitleSearchTab onSubtitleSelected={handleSearchSubtitleSelected} />
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

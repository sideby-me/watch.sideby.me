export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export class SubtitleParser {
  static async parseSubtitleFile(file: File): Promise<SubtitleCue[]> {
    const text = await file.text();
    const extension = file.name.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'vtt':
        return this.parseVTT(text);
      case 'srt':
        return this.parseSRT(text);
      case 'ass':
        return this.parseASS(text);
      default:
        throw new Error(`Unsupported subtitle format: ${extension}`);
    }
  }

  static parseVTT(vttText: string): SubtitleCue[] {
    const cues: SubtitleCue[] = [];
    const lines = vttText.split('\n');
    let i = 0;

    // Skip WEBVTT header
    while (i < lines.length && !lines[i].includes('-->')) {
      i++;
    }

    while (i < lines.length) {
      const timeLine = lines[i];
      if (timeLine && timeLine.includes('-->')) {
        const [startTime, endTime] = timeLine.split('-->').map(t => t.trim());
        const start = this.parseVTTTime(startTime);
        const end = this.parseVTTTime(endTime);

        i++;
        let text = '';
        while (i < lines.length && lines[i].trim() !== '') {
          text += (text ? '\n' : '') + lines[i];
          i++;
        }

        if (text.trim()) {
          cues.push({
            start,
            end,
            text: text.trim(),
          });
        }
      }
      i++;
    }

    return cues;
  }

  static parseSRT(srtText: string): SubtitleCue[] {
    const cues: SubtitleCue[] = [];
    const blocks = srtText.split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length >= 3) {
        const timeLine = lines[1];
        if (timeLine && timeLine.includes('-->')) {
          const [startTime, endTime] = timeLine.split('-->').map(t => t.trim());
          const start = this.parseSRTTime(startTime);
          const end = this.parseSRTTime(endTime);

          const text = lines.slice(2).join('\n');

          cues.push({
            start,
            end,
            text,
          });
        }
      }
    }

    return cues;
  }

  static parseASS(assText: string): SubtitleCue[] {
    const cues: SubtitleCue[] = [];
    const lines = assText.split('\n');
    let inEvents = false;

    for (const line of lines) {
      if (line.startsWith('[Events]')) {
        inEvents = true;
        continue;
      }

      if (line.startsWith('[') && line !== '[Events]') {
        inEvents = false;
        continue;
      }

      if (inEvents && line.startsWith('Dialogue:')) {
        const parts = line.split(',');
        if (parts.length >= 10) {
          const start = this.parseASSTime(parts[1]);
          const end = this.parseASSTime(parts[2]);
          const text = parts.slice(9).join(',').replace(/\\N/g, '\n');

          cues.push({
            start,
            end,
            text,
          });
        }
      }
    }

    return cues;
  }

  private static parseVTTTime(timeString: string): number {
    const parts = timeString.split(':');
    const seconds = parseFloat(parts[parts.length - 1]);
    const minutes = parseInt(parts[parts.length - 2] || '0');
    const hours = parseInt(parts[parts.length - 3] || '0');

    return hours * 3600 + minutes * 60 + seconds;
  }

  private static parseSRTTime(timeString: string): number {
    const [time, milliseconds] = timeString.split(',');
    const [hours, minutes, seconds] = time.split(':').map(Number);
    const ms = parseInt(milliseconds || '0');

    return hours * 3600 + minutes * 60 + seconds + ms / 1000;
  }

  private static parseASSTime(timeString: string): number {
    const parts = timeString.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    const secondsAndCentiseconds = parseFloat(parts[2]);

    return hours * 3600 + minutes * 60 + secondsAndCentiseconds;
  }

  static convertToVTT(cues: SubtitleCue[]): string {
    let vtt = 'WEBVTT\n\n';

    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const start = this.formatVTTTime(cue.start);
      const end = this.formatVTTTime(cue.end);

      vtt += `${start} --> ${end}\n`;
      vtt += `${cue.text}\n\n`;
    }

    return vtt;
  }

  private static formatVTTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const hoursStr = hours.toString().padStart(2, '0');
    const minutesStr = minutes.toString().padStart(2, '0');
    const secsStr = secs.toFixed(3).padStart(6, '0');

    return `${hoursStr}:${minutesStr}:${secsStr}`;
  }

  static createBlobUrl(cues: SubtitleCue[]): string {
    const vttContent = this.convertToVTT(cues);
    const blob = new Blob([vttContent], { type: 'text/vtt' });
    return URL.createObjectURL(blob);
  }
}

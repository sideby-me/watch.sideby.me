'use client';

import { Wrench, Eye, RotateCcw, Type, Bold, Sparkles, PaintBucket, ArrowUpDown, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  useSubtitleSettings,
  FONT_SIZE_SNAPS,
  VERTICAL_POSITION_SNAPS,
  SYNC_OFFSET_MIN,
  SYNC_OFFSET_MAX,
  SYNC_OFFSET_STEP,
} from '@/lib/subtitle-settings-store';

interface SubtitleSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubtitleSettingsDialog({ open, onOpenChange }: SubtitleSettingsDialogProps) {
  const {
    settings,
    setFontSize,
    setVerticalPosition,
    setSyncOffset,
    setBackgroundBlur,
    setBackgroundFill,
    setIsBold,
    resetToDefaults,
  } = useSubtitleSettings();

  // Find nearest snap point for display
  const findNearestSnap = (value: number, snaps: number[]) => {
    return snaps.reduce((prev, curr) => (Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev));
  };

  // Calculate preview font size in pixels for better control
  const getPreviewFontSize = () => {
    const baseSize = 14; // base size in pixels
    return `${(baseSize * settings.fontSize) / 100}px`;
  };

  // Build preview background styles
  const getPreviewBackgroundStyles = (): React.CSSProperties => {
    const styles: React.CSSProperties = {};

    if (settings.backgroundFill) {
      styles.backgroundColor = 'rgba(0, 0, 0, 0.75)';
      styles.border = '1px solid rgba(255, 255, 255, 0.1)';
    } else {
      styles.backgroundColor = 'transparent';
      styles.border = 'none';
    }

    if (settings.backgroundBlur) {
      styles.backdropFilter = 'blur(8px)';
      styles.WebkitBackdropFilter = 'blur(8px)';
    }

    return styles;
  };

  const SettingToggle = ({
    id,
    icon: Icon,
    label,
    description,
    checked,
    onCheckedChange,
  }: {
    id: string;
    icon: typeof Bold;
    label: string;
    description: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <div
      className={`flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors ${
        checked ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`rounded-md p-2 ${checked ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-0.5">
          <Label htmlFor={id} className="cursor-pointer text-sm font-semibold tracking-tight">
            {label}
          </Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium ${checked ? 'text-primary' : 'text-muted-foreground'}`}>
          {checked ? 'ON' : 'OFF'}
        </span>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold tracking-tighter">
            <Type className="h-5 w-5 text-primary" />
            Subtitle Lab
          </DialogTitle>
          <DialogDescription className="text-sm tracking-tight text-muted-foreground">
            Tweak the aesthetics or fix that annoying sync delay.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 py-4">
          {/* Preview Window - fixed height with proper positioning */}
          <div className="overflow-hidden rounded-lg border border-border bg-gradient-to-br from-neutral-900 to-neutral-800">
            <div className="relative flex h-28 items-end justify-center overflow-hidden px-4">
              <div
                className="mb-2 max-w-full truncate rounded-md px-3 py-1.5 text-center text-white transition-all duration-200"
                style={{
                  marginBottom: `${Math.max(8, (settings.verticalPosition / 25) * 40)}px`,
                  fontFamily:
                    'var(--font-space-grotesk), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  fontWeight: settings.isBold ? 700 : 500,
                  fontSize: getPreviewFontSize(),
                  textShadow:
                    settings.backgroundFill || settings.backgroundBlur ? 'none' : '1px 1px 2px rgba(0, 0, 0, 0.8)',
                  ...getPreviewBackgroundStyles(),
                }}
              >
                dramatic music intensifies...
              </div>
            </div>
          </div>

          {/* FIX IT Section - Timing (Most urgent, at top) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-primary/10 p-1.5">
                <Wrench className="h-3.5 w-3.5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight">Sync Repair</h3>
            </div>

            {/* Sync Offset */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-muted p-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold tracking-tight">Timing Offset</Label>
                    <span className="font-mono text-sm text-muted-foreground">
                      {settings.syncOffset > 0 ? '+' : ''}
                      {settings.syncOffset.toFixed(1)}s
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-12 text-xs text-muted-foreground">Early</span>
                    <Slider
                      value={[settings.syncOffset]}
                      onValueChange={([value]) => setSyncOffset(value)}
                      min={SYNC_OFFSET_MIN}
                      max={SYNC_OFFSET_MAX}
                      step={SYNC_OFFSET_STEP}
                      className="flex-1"
                    />
                    <span className="w-10 text-right text-xs text-muted-foreground">Late</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SET ONCE Section - Readability */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-primary/10 p-1.5">
                <Eye className="h-3.5 w-3.5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold tracking-tight">Visuals</h3>
            </div>

            {/* Font Size - Most changed, at top */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-muted p-2 text-muted-foreground">
                  <Type className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold tracking-tight">Text Scale</Label>
                    <span className="font-mono text-sm text-muted-foreground">{settings.fontSize}%</span>
                  </div>
                  <Slider
                    value={[settings.fontSize]}
                    onValueChange={([value]) => setFontSize(findNearestSnap(value, FONT_SIZE_SNAPS))}
                    min={50}
                    max={175}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Tiny</span>
                    <span>Huge</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Toggle Options */}
            <SettingToggle
              id="bold-toggle"
              icon={Bold}
              label="Bold Mode"
              description="Make it punchy"
              checked={settings.isBold}
              onCheckedChange={setIsBold}
            />

            <SettingToggle
              id="blur-toggle"
              icon={Sparkles}
              label="Frosted Glass"
              description="Add a blur for better contrast"
              checked={settings.backgroundBlur}
              onCheckedChange={setBackgroundBlur}
            />

            <SettingToggle
              id="fill-toggle"
              icon={PaintBucket}
              label="Solid Background"
              description="The classic closed-caption look"
              checked={settings.backgroundFill}
              onCheckedChange={setBackgroundFill}
            />

            {/* Vertical Position */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-muted p-2 text-muted-foreground">
                  <ArrowUpDown className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold tracking-tight">Height Adjustment</Label>
                    <span className="font-mono text-sm text-muted-foreground">{settings.verticalPosition}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-10 text-xs text-muted-foreground">Floor</span>
                    <Slider
                      value={[settings.verticalPosition]}
                      onValueChange={([value]) => setVerticalPosition(findNearestSnap(value, VERTICAL_POSITION_SNAPS))}
                      min={5}
                      max={25}
                      step={1}
                      className="flex-1"
                    />
                    <span className="w-8 text-right text-xs text-muted-foreground">Ceiling</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-shrink-0 justify-between gap-3 border-t bg-card/50 px-6 py-4">
          <Button type="button" variant="ghost" onClick={resetToDefaults} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset Defaults
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Looks Good
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

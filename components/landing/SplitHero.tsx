'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';

/**
 * SplitHero - The signature split-screen hero
 * Two panels showing same content with intentional desync that snaps into alignment on scroll
 */
export function SplitHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSynced, setIsSynced] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Calculate how far we've scrolled into the section (0 to 1)
      const progress = Math.max(0, Math.min(1, -rect.top / (viewportHeight * 0.3)));
      setScrollProgress(progress);

      // Sync triggers at 20% scroll
      setIsSynced(progress > 0.2);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Calculate offset based on sync state - starts offset, snaps to 0
  const leftOffset = isSynced ? 0 : -20;
  const rightOffset = isSynced ? 0 : 20;
  const leftDelay = isSynced ? 0 : 150;
  const rightDelay = isSynced ? 0 : 0;

  return (
    <section ref={containerRef} className="relative min-h-[110vh] overflow-hidden">
      {/* Split Container */}
      <div className="sticky top-0 flex h-screen w-full">
        {/* Left Panel */}
        <div
          className="relative flex h-full w-1/2 flex-col items-end justify-center overflow-hidden border-r border-border/30 bg-background pr-8 transition-transform duration-700 ease-out md:pr-16"
          style={{
            transform: `translateY(${leftOffset}px)`,
            transitionDelay: `${leftDelay}ms`,
          }}
        >
          <div className="max-w-md text-right">
            <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-bold leading-[0.9] tracking-tighter md:text-7xl lg:text-8xl">
              Watch
              <br />
              <span className="text-primary">Together.</span>
            </h1>
          </div>
        </div>

        {/* Right Panel */}
        <div
          className="relative flex h-full w-1/2 flex-col items-start justify-center overflow-hidden bg-background pl-8 transition-transform duration-700 ease-out md:pl-16"
          style={{
            transform: `translateY(${rightOffset}px)`,
            transitionDelay: `${rightDelay}ms`,
          }}
        >
          <div className="max-w-md">
            <h1 className="font-[family-name:var(--font-space-grotesk)] text-5xl font-bold leading-[0.9] tracking-tighter md:text-7xl lg:text-8xl">
              From
              <br />
              <span className="text-muted-foreground">Anywhere.</span>
            </h1>
          </div>
        </div>

        {/* Center Divider - stops at the buttons area */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-[calc(50%-80px)] w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-border/50 to-border/30" />

        {/* Sync Indicator - positioned in the middle */}
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <SyncIndicator isSynced={isSynced} />
        </div>

        {/* Bottom section with CTAs and scroll hint */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-6 pb-8">
          {/* Scroll hint - now above buttons */}
          <div
            className={`text-center text-sm transition-opacity duration-500 ${isSynced ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {isSynced ? (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Synced
              </span>
            ) : (
              <span className="animate-pulse">↓ Scroll to sync</span>
            )}
          </div>

          {/* CTAs */}
          <div className="flex gap-4">
            <Link href="/create">
              <Button variant="secondary" size="lg" className="group gap-2 px-8">
                Fine, let&apos;s do it
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link href="/join">
              <Button variant="ghost" size="lg" className="text-muted-foreground hover:bg-accent hover:text-foreground">
                I have a room code
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * SyncIndicator - Shows sync status between panels
 */
function SyncIndicator({ isSynced }: { isSynced: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur-sm transition-all duration-500 ${
        isSynced
          ? 'border-primary/50 bg-primary/10 text-primary'
          : 'border-border bg-background/80 text-muted-foreground'
      } `}
    >
      {isSynced ? (
        <>
          <CheckCircle2 className="h-4 w-4" />
          <span className="font-mono text-sm">In Sync</span>
        </>
      ) : (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-mono text-sm">Syncing...</span>
        </>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, Link2, Loader2 } from 'lucide-react';

export function SplitHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSynced, setIsSynced] = useState(false);
  const [_scrollProgress, setScrollProgress] = useState(0);

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
          className="relative flex h-full w-1/2 flex-col items-end justify-center overflow-hidden bg-background pr-8 duration-700 ease-out transition-interactive md:pr-16"
          style={{
            transform: `translateY(${leftOffset}px)`,
            transitionDelay: `${leftDelay}ms`,
          }}
        >
          <div className="max-w-md text-right">
            <h1 className="text-5xl font-bold leading-[0.9] tracking-tighter md:text-7xl lg:text-8xl">
              Watch
              <br />
              <span className="text-primary">Together.</span>
            </h1>
          </div>
        </div>

        {/* Right Panel */}
        <div
          className="relative flex h-full w-1/2 flex-col items-start justify-center overflow-hidden bg-background pl-8 duration-700 ease-out transition-interactive md:pl-16"
          style={{
            transform: `translateY(${rightOffset}px)`,
            transitionDelay: `${rightDelay}ms`,
          }}
        >
          <div className="max-w-md">
            <h1 className="text-5xl font-bold leading-[0.9] tracking-tighter md:text-7xl lg:text-8xl">
              From
              <br />
              <span className="text-muted-foreground">Anywhere.</span>
            </h1>
          </div>
        </div>

        {/* Center Divider - gradient that fades out at top and bottom */}
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-foreground/20 to-transparent" />

        {/* Sync Indicator - positioned in the middle */}
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <SyncIndicator isSynced={isSynced} />
        </div>

        {/* Bottom section with CTAs and scroll hint */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-6 pb-40">
          {/* CTAs */}
          <div className="flex gap-4">
            <Link href="/create">
              <Button size="lg" className="group gap-2 px-8">
                Fine, let's do it
                <ArrowRight className="h-4 w-4 transition-interactive group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link href="/join">
              <Button variant="outline" size="lg" className="gap-2">
                <Link2 className="h-4 w-4" />
                Join with code
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// Shows sync status between panels
function SyncIndicator({ isSynced }: { isSynced: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur-sm duration-500 transition-interactive ${
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

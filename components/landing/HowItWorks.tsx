'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { BadgePlus, Link2, Play, Clapperboard } from 'lucide-react';

interface Scene {
  id: number;
  title: string;
  action: string;
  description: string;
  icon: React.ReactNode;
  meta: string;
}

const scenes: Scene[] = [
  {
    id: 1,
    title: 'THE SETUP',
    action: 'CREATE ROOM',
    description: 'One click. No sign-up. Just a room that actually works.',
    icon: <BadgePlus className="h-10 w-10" />,
    meta: 'INT. DAY',
  },
  {
    id: 2,
    title: 'THE HAND-OFF',
    action: 'SHARE LINK',
    description: "Send it however you want. We don't need to know.",
    icon: <Link2 className="h-10 w-10" />,
    meta: 'EXT. NIGHT',
  },
  {
    id: 3,
    title: 'ACTION',
    action: 'WATCH TOGETHER',
    description: 'Millisecond-accurate sync. Because "close enough" isn\'t.',
    icon: <Play className="h-10 w-10" />,
    meta: 'FINAL CUT',
  },
];

// Configuration
const TOTAL_TRAVEL = 3000; // Total horizontal pixels to travel
const TRIGGER_OFFSET = 100; // Start sticky when section is this many px from top

export function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [horizontalProgress, setHorizontalProgress] = useState(0);
  const [isInSection, setIsInSection] = useState(false);
  const lastScrollY = useRef(0);
  const accumulatedDelta = useRef(0);

  // Calculate progress from scroll position (for scrollbar dragging)
  const updateProgressFromScroll = useCallback(() => {
    if (!sectionRef.current) return;

    const rect = sectionRef.current.getBoundingClientRect();
    const sectionHeight = sectionRef.current.offsetHeight;
    const scrollableHeight = sectionHeight - window.innerHeight;

    // How far into the section are we?
    // Section starts when top reaches TRIGGER_OFFSET, ends when bottom reaches viewport bottom
    const scrolledIntoSection = -rect.top + TRIGGER_OFFSET;
    const progress = Math.max(0, Math.min(1, scrolledIntoSection / scrollableHeight));

    setHorizontalProgress(progress);
    accumulatedDelta.current = progress * TOTAL_TRAVEL;

    // Check if we're in the active zone
    const inSection = rect.top <= TRIGGER_OFFSET && rect.bottom > window.innerHeight;
    setIsInSection(inSection);
  }, []);

  // Handle wheel events - prevent default scroll when in section
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!sectionRef.current) return;

    const rect = sectionRef.current.getBoundingClientRect();

    // Check if section is in active zone (earlier trigger)
    const inSection = rect.top <= TRIGGER_OFFSET && rect.bottom > window.innerHeight;

    if (!inSection) return;

    // Check if we're at boundaries
    const currentProgress = accumulatedDelta.current / TOTAL_TRAVEL;
    const scrollingDown = e.deltaY > 0;
    const scrollingUp = e.deltaY < 0;
    const atStart = currentProgress <= 0 && scrollingUp;
    const atEnd = currentProgress >= 1 && scrollingDown;

    if (atStart || atEnd) {
      // Allow normal scroll at boundaries
      return;
    }

    // Block vertical scroll and accumulate for horizontal movement
    e.preventDefault();

    accumulatedDelta.current = Math.max(0, Math.min(TOTAL_TRAVEL, accumulatedDelta.current + e.deltaY * 1.5));

    setHorizontalProgress(accumulatedDelta.current / TOTAL_TRAVEL);
  }, []);

  // Handle scroll events (for scrollbar and programmatic scrolling)
  useEffect(() => {
    const handleScroll = () => {
      updateProgressFromScroll();
      lastScrollY.current = window.scrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial call

    return () => window.removeEventListener('scroll', handleScroll);
  }, [updateProgressFromScroll]);

  // Handle wheel events
  useEffect(() => {
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Touch support
  const touchStartY = useRef(0);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!sectionRef.current) return;

      const rect = sectionRef.current.getBoundingClientRect();
      const inSection = rect.top <= TRIGGER_OFFSET && rect.bottom > window.innerHeight;

      if (!inSection) return;

      const deltaY = touchStartY.current - e.touches[0].clientY;
      const currentProgress = accumulatedDelta.current / TOTAL_TRAVEL;
      const atStart = currentProgress <= 0 && deltaY < 0;
      const atEnd = currentProgress >= 1 && deltaY > 0;

      if (atStart || atEnd) return;

      e.preventDefault();

      accumulatedDelta.current = Math.max(0, Math.min(TOTAL_TRAVEL, accumulatedDelta.current + deltaY * 2));

      setHorizontalProgress(accumulatedDelta.current / TOTAL_TRAVEL);
      touchStartY.current = e.touches[0].clientY;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      // Reduced height - just enough for the animation
      className="relative z-10 h-[150vh]"
    >
      {/* Sticky viewport */}
      <div className="sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden bg-background">
        {/* Top/Bottom Vignette */}
        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-background via-transparent to-background" />

        {/* Left/Right Edge Fade */}
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            background:
              'linear-gradient(to right, hsl(var(--background)) 0%, transparent 8%, transparent 92%, hsl(var(--background)) 100%)',
          }}
        />

        {/* Projector Light Glow */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />

        {/* Header */}
        <div
          className="absolute left-0 right-0 top-20 z-30 text-center transition-all duration-300"
          style={{
            opacity: Math.max(0, 1 - horizontalProgress * 4),
            transform: `translateY(${horizontalProgress * -30}px)`,
          }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-md">
            <Clapperboard className="h-4 w-4 text-primary" />
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">How It Works</span>
          </div>
        </div>

        {/* Progress Indicator */}
        {isInSection && (
          <div className="pointer-events-none absolute bottom-8 left-1/2 z-30 -translate-x-1/2">
            <div className="flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 backdrop-blur-sm">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-75"
                  style={{ width: `${horizontalProgress * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* The Film Strip - HEAD starts at left edge */}
        <div
          className="flex items-center will-change-transform"
          style={{
            // Start with HEAD at left edge (0), then move left as progress increases
            transform: `translateX(calc(0px - ${horizontalProgress * TOTAL_TRAVEL}px))`,
          }}
        >
          {/* Leader Frames (empty) */}
          <EmptyFrame label="HEAD" frameNumber="01" />
          <EmptyFrame label="" frameNumber="02" />

          {/* Content Frames */}
          {scenes.map((scene, index) => (
            <FilmFrame key={scene.id} scene={scene} index={index} />
          ))}

          {/* Trailer Frames (empty) */}
          <EmptyFrame label="" frameNumber="18" />
          <EmptyFrame label="TAIL" frameNumber="19" />
        </div>
      </div>
    </section>
  );
}

function EmptyFrame({ label, frameNumber }: { label: string; frameNumber: string }) {
  return (
    <div className="relative flex h-[500px] w-[600px] flex-shrink-0 flex-col bg-black/60">
      <div className="relative flex h-14 w-full items-center justify-between gap-4 border-b border-white/5 bg-black px-4 py-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-5 w-4 rounded-[2px] bg-white/10" />
        ))}
        <span className="absolute bottom-1 right-2 font-mono text-[10px] text-white/20">{frameNumber}</span>
      </div>

      <div className="flex flex-1 items-center justify-center border-r border-white/5">
        {label && <span className="font-mono text-sm uppercase tracking-[0.3em] text-white/10">{label}</span>}
      </div>

      <div className="relative flex h-14 w-full items-center justify-between gap-4 border-t border-white/5 bg-black px-4 py-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-5 w-4 rounded-[2px] bg-white/10" />
        ))}
        <span className="absolute left-4 top-1 font-mono text-[10px] text-white/20">SIDEBY COLOR II</span>
      </div>
    </div>
  );
}

function FilmFrame({ scene, index }: { scene: Scene; index: number }) {
  return (
    <div className="group relative flex h-[500px] w-[600px] flex-shrink-0 flex-col bg-background/40 backdrop-blur-sm">
      <div className="relative flex h-14 w-full items-center justify-between gap-4 border-b border-white/5 bg-black px-4 py-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-5 w-4 rounded-[2px] bg-white/10 shadow-inner" />
        ))}
        <span className="absolute bottom-1 right-2 font-mono text-[10px] text-white/30">{index + 14}A</span>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center border-r border-white/5 p-12 text-center transition-colors duration-500 hover:bg-white/5">
        <div className="absolute left-0 top-0 h-full w-[1px] bg-white/5" />

        <div className="mb-8 flex w-full justify-between font-[family-name:var(--font-space-mono)] text-xs tracking-widest text-muted-foreground/40">
          <span>SCENE {String(index + 1).padStart(2, '0')}</span>
          <span>{scene.meta}</span>
        </div>

        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-white/5 to-white/0 text-primary ring-1 ring-white/10 transition-transform duration-500 group-hover:scale-110">
          {scene.icon}
        </div>

        <h3 className="mb-2 font-[family-name:var(--font-space-mono)] text-xs font-bold uppercase tracking-[0.2em] text-primary/80">
          {scene.action}
        </h3>
        <h2 className="mb-4 font-[family-name:var(--font-space-grotesk)] text-3xl font-bold uppercase leading-none tracking-tight text-foreground">
          {scene.title}
        </h2>

        <p className="max-w-xs text-base font-light leading-relaxed text-muted-foreground">{scene.description}</p>
      </div>

      <div className="relative flex h-14 w-full items-center justify-between gap-4 border-t border-white/5 bg-black px-4 py-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-5 w-4 rounded-[2px] bg-white/10 shadow-inner" />
        ))}
        <span className="absolute left-4 top-1 font-mono text-[10px] text-white/30">SIDEBY COLOR II</span>
      </div>
    </div>
  );
}

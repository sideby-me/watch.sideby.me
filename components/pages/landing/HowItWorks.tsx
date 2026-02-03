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

const TOTAL_TRAVEL = 3000; // Total horizontal pixels to travel
const TRIGGER_OFFSET = 100; // Start sticky when section is this many px from top

export function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [horizontalProgress, setHorizontalProgress] = useState(0);

  // Manual sticky logic
  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current || !viewportRef.current) return;

      const rect = sectionRef.current.getBoundingClientRect();
      const sectionHeight = sectionRef.current.offsetHeight;
      const viewportHeight = window.innerHeight;

      // Calculate scroll progress
      const scrollableDistance = sectionHeight - viewportHeight;
      // Start scrolling when the section is still 50% down the viewport
      const startOffset = viewportHeight * 0.5;
      // Add the offset to the 'scrolled' amount effectively shifting the start time earlier
      const scrolled = -rect.top + startOffset;
      // Allow progress to go beyond 1 (overshoot)
      const progress = Math.max(0, scrolled / scrollableDistance);

      setHorizontalProgress(progress);

      // Manual Sticky Positioning
      if (rect.top <= 0 && rect.bottom >= viewportHeight) {
        // We are scrubbing through: Fix it to the viewport
        viewportRef.current.style.position = 'fixed';
        viewportRef.current.style.top = '0';
        viewportRef.current.style.left = `${rect.left}px`;
        viewportRef.current.style.width = `${rect.width}px`;
        viewportRef.current.style.bottom = 'auto'; // Clear bottom
      } else if (rect.bottom < viewportHeight) {
        // We scrolled past: Pin it to the bottom of the container
        viewportRef.current.style.position = 'absolute';
        viewportRef.current.style.top = 'auto'; // Clear top
        viewportRef.current.style.bottom = '0';
        viewportRef.current.style.left = '0'; // align relative to container
        viewportRef.current.style.width = '100%';
      } else {
        // We haven't reached it yet: Pin it to the top of the container
        viewportRef.current.style.position = 'absolute';
        viewportRef.current.style.top = '0';
        viewportRef.current.style.left = '0'; // align relative to container
        viewportRef.current.style.width = '100%';
        viewportRef.current.style.bottom = 'auto'; // Clear bottom
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative z-10 h-[250vh]">
      {/* Sticky viewport */}
      <div
        ref={viewportRef}
        className="flex h-screen w-full items-center overflow-hidden bg-background"
        style={{ position: 'absolute', top: 0, left: 0 }} // Default start
      >
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

        <div
          className="absolute left-0 right-0 top-20 z-30 text-center transition-all duration-300"
          style={{
            opacity: Math.max(0, 1 - horizontalProgress * 6),
            transform: `translateY(${horizontalProgress * -50}px)`,
          }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-md">
            <Clapperboard className="h-4 w-4 text-primary" />
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">How It Works</span>
          </div>
        </div>

        {/* Progress Indicator */}
        <div
          className="pointer-events-none absolute bottom-8 left-1/2 z-30 -translate-x-1/2 transition-opacity duration-300"
          style={{ opacity: 1 }}
        >
          <div className="flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 backdrop-blur-sm">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-primary transition-all duration-75"
                style={{ width: `${Math.min(1, horizontalProgress) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* The Film Strip */}
        <div
          className="flex will-change-transform"
          style={{
            transform: `translateX(calc(-${horizontalProgress} * (4200px - 100vw)))`,
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
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      className="group relative flex h-[500px] w-[600px] flex-shrink-0 flex-col overflow-hidden bg-background/40 backdrop-blur-sm"
    >
      {/* Spotlight Effect */}
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, hsl(var(--primary) / 0.15), transparent 40%)`,
        }}
      />

      {/* Top Border */}
      <div className="relative z-10 flex h-14 w-full items-center justify-between gap-4 border-b border-white/5 bg-black px-4 py-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-5 w-4 rounded-[2px] bg-white/10 shadow-inner" />
        ))}
        <span className="absolute bottom-1 right-2 font-mono text-[10px] text-white/30">{index + 14}A</span>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center border-r border-white/5 p-12 text-center transition-colors duration-500">
        <div className="absolute left-0 top-0 h-full w-[1px] bg-white/5" />

        <div className="mb-8 flex w-full justify-between font-[family-name:var(--font-space-mono)] text-xs tracking-widest text-muted-foreground/40">
          <span>SCENE {String(index + 1).padStart(2, '0')}</span>
          <span>{scene.meta}</span>
        </div>

        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-white/5 to-white/0 text-primary ring-1 ring-white/10 transition-all duration-500 group-hover:bg-primary/10 group-hover:shadow-[0_0_50px_-10px_hsl(var(--primary))] group-hover:ring-primary/50">
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

      {/* Bottom Border */}
      <div className="relative z-10 flex h-14 w-full items-center justify-between gap-4 border-t border-white/5 bg-black px-4 py-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-5 w-4 rounded-[2px] bg-white/10 shadow-inner" />
        ))}
        <span className="absolute left-4 top-1 font-mono text-[10px] text-white/30">SIDEBY COLOR II</span>
      </div>
    </div>
  );
}

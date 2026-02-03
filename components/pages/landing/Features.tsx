'use client';

import { useEffect, useRef, useState } from 'react';
import { UserX, Zap, Globe, Mic, Subtitles, Shield } from 'lucide-react';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
  serial: string;
  highlight: string;
}

const features: Feature[] = [
  {
    icon: <UserX className="h-5 w-5" />,
    title: 'NO SIGN-UP REQUIRED',
    description: "Just create. Just watch. We don't need your email.",
    serial: '#00284',
    highlight: 'PRIVACY',
  },
  {
    icon: <Zap className="h-5 w-5" />,
    title: 'MILLISECOND SYNC',
    description: 'Real-time synchronization. WebRTC done right.',
    serial: '#00285',
    highlight: 'SPEED',
  },
  {
    icon: <Globe className="h-5 w-5" />,
    title: 'WORKS EVERYWHERE',
    description: 'YouTube, Vimeo, direct links. If it plays, we sync.',
    serial: '#00286',
    highlight: 'UNIVERSAL',
  },
  {
    icon: <Mic className="h-5 w-5" />,
    title: 'BUILT-IN VOICE',
    description: 'Talk while you watch. No third-party app needed.',
    serial: '#00287',
    highlight: 'INTEGRATED',
  },
  {
    icon: <Subtitles className="h-5 w-5" />,
    title: 'SUBTITLE SUPPORT',
    description: 'Upload your own subs. We handle the syncing.',
    serial: '#00288',
    highlight: 'ACCESSIBLE',
  },
  {
    icon: <Shield className="h-5 w-5" />,
    title: 'ROOM CONTROLS',
    description: 'Host controls, passcodes, capacity limits.',
    serial: '#00289',
    highlight: 'SECURE',
  },
];

export function Features() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative z-10 overflow-hidden bg-background py-32">
      {/* Console Surface Background */}
      <div className="absolute inset-0 bg-background" />

      {/* Subtle Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* LED Strip Accent */}
      <div className="absolute left-0 right-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Ambient Glow */}
      <div className="absolute left-1/4 top-1/2 h-[400px] w-[600px] -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-[1400px] px-6">
        {/* Section Header */}
        <div className="mb-20 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground backdrop-blur-md">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            System Status: Operational
          </div>
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            What&apos;s Included
          </h2>
          <p className="mx-auto mt-6 max-w-md text-lg font-light text-muted-foreground">
            Everything you need. Nothing you don&apos;t.
          </p>
        </div>

        {/* Ticket Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <TicketStub key={feature.serial} feature={feature} index={index} isVisible={isVisible} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TicketStub({ feature, index, isVisible }: { feature: Feature; index: number; isVisible: boolean }) {
  // Slight random rotation for organic feel
  const rotation = ['-1deg', '0.5deg', '-0.5deg', '1deg', '-0.8deg', '0.3deg'][index];
  const delay = index * 100;

  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      className={`group relative transition-all duration-700 ease-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
      }`}
      style={{
        transitionDelay: `${delay}ms`,
        transform: isVisible ? `rotate(${rotation})` : undefined,
      }}
    >
      {/* Ticket Container */}
      <div
        ref={divRef}
        onMouseMove={handleMouseMove}
        className="relative overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:border-white/10 group-hover:bg-white/[0.04]"
      >
        {/* Spotlight Effect */}
        <div
          className="pointer-events-none absolute -inset-px opacity-0 transition duration-300 group-hover:opacity-100"
          style={{
            background: `radial-gradient(400px circle at ${position.x}px ${position.y}px, hsl(var(--primary) / 0.1), transparent 40%)`,
          }}
        />

        {/* Perforated Edge (Left) */}
        <div className="absolute bottom-0 left-0 top-0 w-4 border-r border-dashed border-white/10 bg-black/20" />

        {/* Ticket Content */}
        <div className="py-6 pl-8 pr-6">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-primary ring-1 ring-white/10 transition-colors group-hover:bg-primary/10 group-hover:ring-primary/20">
                {feature.icon}
              </span>
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
                FEATURE PASS
              </span>
            </div>
            <span className="font-mono text-[9px] text-white/20">{feature.serial}</span>
          </div>

          {/* Main Content */}
          <div className="mb-6">
            <h3 className="mb-3 font-[family-name:var(--font-space-grotesk)] text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
              {feature.title}
            </h3>
            <p className="font-mono text-xs leading-relaxed text-muted-foreground/80">{feature.description}</p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/5 pt-4">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[9px] text-muted-foreground/40">ADMIT ONE</span>
              <span className="rounded-sm border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-primary">
                {feature.highlight}
              </span>
            </div>
            <span className="font-mono text-[9px] text-white/10">02.03.26</span>
          </div>
        </div>

        {/* Ticket Shadow/Glow */}
        <div className="absolute -bottom-1 left-4 right-4 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent blur-sm transition-all duration-300 group-hover:blur-md" />
      </div>
    </div>
  );
}

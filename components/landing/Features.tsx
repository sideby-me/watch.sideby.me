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
      <div className="absolute inset-0 bg-[#0a0a0a]" />

      {/* Subtle Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* LED Strip Accent */}
      <div className="absolute left-0 right-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

      {/* Ambient Glow */}
      <div className="bg-primary/3 absolute left-1/4 top-1/2 h-[400px] w-[600px] -translate-y-1/2 rounded-full blur-[120px]" />
      <div className="bg-blue-500/3 absolute right-1/4 top-1/3 h-[300px] w-[400px] rounded-full blur-[100px]" />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        {/* Section Header */}
        <div className="mb-20 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-sm border border-white/10 bg-white/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            System Status: Operational
          </div>
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-4xl font-bold tracking-tight md:text-5xl">
            What&apos;s included
          </h2>
          <p className="mx-auto mt-4 max-w-md text-muted-foreground">Everything you need. Nothing you don&apos;t.</p>
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

  return (
    <div
      className={`group relative transition-all duration-500 ease-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
      }`}
      style={{
        transitionDelay: `${delay}ms`,
        transform: isVisible ? `rotate(${rotation})` : undefined,
      }}
    >
      {/* Ticket Container */}
      <div className="relative overflow-hidden rounded-sm bg-[#f5f2eb] transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_8px_30px_-10px_rgba(0,0,0,0.5)]">
        {/* Perforated Edge (Left) */}
        <div className="absolute bottom-0 left-0 top-0 w-3 border-r border-dashed border-black/10 bg-[#ebe8e1]" />

        {/* Ticket Content */}
        <div className="py-5 pl-6 pr-5">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between border-b border-black/10 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-black/60">{feature.icon}</span>
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-black/40">
                SIDEBY FEATURE PASS
              </span>
            </div>
            <span className="font-mono text-[9px] text-black/30">{feature.serial}</span>
          </div>

          {/* Main Content */}
          <div className="mb-4">
            <h3 className="mb-2 font-[family-name:var(--font-space-grotesk)] text-lg font-bold tracking-tight text-black/90">
              {feature.title}
            </h3>
            <p className="font-mono text-xs leading-relaxed text-black/50">{feature.description}</p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-black/10 pt-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[9px] text-black/30">ADMIT ONE</span>
              <span className="rounded-sm bg-black/5 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-black/50">
                {feature.highlight}
              </span>
            </div>
            <span className="font-mono text-[9px] text-black/25">02.03.26</span>
          </div>
        </div>

        {/* Hover Glow Effect */}
        <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="absolute -bottom-4 left-1/2 h-8 w-3/4 -translate-x-1/2 rounded-full bg-primary/20 blur-xl" />
        </div>

        {/* Paper Texture Overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-multiply"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Ticket Shadow */}
      <div className="absolute -bottom-1 left-2 right-2 h-2 rounded-full bg-black/20 blur-sm transition-all duration-300 group-hover:-bottom-2 group-hover:blur-md" />
    </div>
  );
}

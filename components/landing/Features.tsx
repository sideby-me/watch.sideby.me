'use client';

import { useEffect, useRef, useState } from 'react';
import { UserX, Zap, Globe, Mic, Subtitles, Shield } from 'lucide-react';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
  highlight?: string;
}

const features: Feature[] = [
  {
    icon: <UserX className="h-6 w-6" />,
    title: 'No Sign-Up Required',
    description: "Just create. Just watch. We don't need your email, your data, or your firstborn.",
    highlight: 'Privacy first',
  },
  {
    icon: <Zap className="h-6 w-6" />,
    title: 'Millisecond Sync',
    description: 'Real-time synchronization that actually works. WebRTC done right for once.',
    highlight: 'Sub-100ms',
  },
  {
    icon: <Globe className="h-6 w-6" />,
    title: 'Works Everywhere',
    description: 'YouTube, Vimeo, direct links, whatever. If it plays, we sync it.',
    highlight: 'Universal',
  },
  {
    icon: <Mic className="h-6 w-6" />,
    title: 'Built-in Voice',
    description: 'Talk while you watch. React in real-time. No third-party app needed.',
    highlight: 'Integrated',
  },
  {
    icon: <Subtitles className="h-6 w-6" />,
    title: 'Subtitle Support',
    description: 'Upload your own subs. We handle the syncing so you can focus on reading.',
    highlight: 'Accessible',
  },
  {
    icon: <Shield className="h-6 w-6" />,
    title: 'Room Controls',
    description: 'Host controls, passcodes, capacity limits. Your room, your rules.',
    highlight: 'Secure',
  },
];

/**
 * Features - Grid of feature cards with staggered reveal
 */
export function Features() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visibleCards, setVisibleCards] = useState<number[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // Stagger the reveal of cards
            features.forEach((_, index) => {
              setTimeout(() => {
                setVisibleCards(prev => [...prev, index]);
              }, index * 100);
            });
          }
        });
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative py-32">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="mb-20 text-center">
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-4xl font-bold tracking-tight md:text-5xl">
            Built for people who actually use it.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">
            Features that matter. No bloat. No &quot;upgrade to unlock.&quot;
          </p>
        </div>

        {/* Features Grid */}
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <FeatureCard key={index} feature={feature} isVisible={visibleCards.includes(index)} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature, isVisible }: { feature: Feature; isVisible: boolean }) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-500 ease-out hover:border-primary/30 hover:bg-accent/50 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'} `}
    >
      {/* Highlight tag */}
      {feature.highlight && (
        <span className="absolute right-4 top-4 rounded-full bg-primary/10 px-3 py-1 font-mono text-xs text-primary">
          {feature.highlight}
        </span>
      )}

      {/* Icon */}
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors duration-300 group-hover:bg-primary/10 group-hover:text-primary">
        {feature.icon}
      </div>

      {/* Content */}
      <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>

      {/* Hover gradient overlay */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </div>
  );
}

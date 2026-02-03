'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BadgePlus, ArrowRight, Zap } from 'lucide-react';

export function CallToAction() {
  return (
    <section className="relative overflow-hidden py-32">
      {/* Background */}
      <div className="absolute inset-0 -z-10 bg-[#020202]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />

        {/* Animated Glow Orbs */}
        <div className="animate-pulse-slow absolute bottom-0 left-1/3 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-[120px]" />
        <div
          className="animate-pulse-slow absolute bottom-0 right-1/3 h-[500px] w-[500px] translate-x-1/2 rounded-full bg-purple-500/10 blur-[120px]"
          style={{ animationDelay: '2s' }}
        />

        {/* Grid Overlay */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            maskImage: 'linear-gradient(to bottom, transparent, black, transparent)',
          }}
        />
      </div>

      <div className="container relative z-10 mx-auto px-6 text-center">
        {/* Badge */}
        <div className="animate-fade-in mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs uppercase tracking-widest text-primary backdrop-blur-md transition-colors hover:bg-white/10">
          <Zap className="h-3 w-3 fill-current" />
          <span>Instant Setup</span>
        </div>

        {/* Main Heading */}
        <h2 className="mx-auto max-w-4xl font-[family-name:var(--font-space-grotesk)] text-5xl font-bold tracking-tight text-white md:text-7xl">
          <span className="block text-white/40">Ready to</span>
          <span className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">sync up?</span>
        </h2>

        <p className="mx-auto mt-8 max-w-lg text-lg font-light text-white/60 md:text-xl">
          Create a room in seconds. No account needed.
          <br className="hidden md:block" />
          Watch together like you&apos;re actually together.
        </p>

        {/* CTAs */}
        <div className="mt-12 flex flex-col items-center justify-center gap-6 sm:flex-row">
          <Link href="/create">
            <Button
              size="lg"
              className="group relative h-14 overflow-hidden border-0 bg-primary px-8 text-lg text-primary-foreground shadow-[0_0_40px_-10px_rgba(var(--primary),0.5)] transition-interactive hover:scale-105 hover:shadow-[0_0_60px_-15px_rgba(var(--primary),0.6)]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <BadgePlus className="mr-2 h-5 w-5" />
              Create a Room
            </Button>
          </Link>

          <Link href="/join">
            <Button
              variant="outline"
              size="lg"
              className="group h-14 border-white/10 bg-white/5 px-8 text-lg text-white backdrop-blur-sm transition-interactive hover:border-white/20 hover:bg-white/10"
            >
              Have a code?
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
        </div>

        {/* Footer Text */}
        <p className="mt-16 font-mono text-xs uppercase tracking-widest text-white/20">
          Built by hermits • for recovering hermits
        </p>
      </div>
    </section>
  );
}

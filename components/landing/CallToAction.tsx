'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BadgePlus, ArrowRight } from 'lucide-react';

/**
 * CallToAction - Final CTA section
 */
export function CallToAction() {
  return (
    <section className="relative overflow-hidden py-32">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="container mx-auto px-6 text-center">
        {/* Main heading */}
        <h2 className="font-[family-name:var(--font-space-grotesk)] text-4xl font-bold tracking-tight md:text-6xl">
          Ready to sync up?
        </h2>

        <p className="mx-auto mt-6 max-w-lg text-lg text-muted-foreground">
          Create a room in seconds. No account needed.
          <br className="hidden md:block" />
          Watch together like you&apos;re actually together.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/create">
            <Button size="lg" className="gap-2 px-8 text-lg">
              <BadgePlus className="h-5 w-5" />
              Create a Room
            </Button>
          </Link>

          <Link href="/join">
            <Button variant="ghost" size="lg" className="gap-2 text-lg text-muted-foreground hover:text-foreground">
              Already have a link?
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* Trust indicator */}
        <p className="mt-12 font-mono text-sm text-muted-foreground/60">Built by hermits, for recovering hermits.</p>
      </div>
    </section>
  );
}

'use client';

import { Icon } from '@/components/ui/icon';
import { Pencil, Plus, PartyPopper } from 'lucide-react';

export default function HowItWorks() {
  return (
    <section className="flex w-full shrink-0 grow basis-0 items-center justify-center gap-4 px-6 py-24">
      <div className="4xl:max-w-screen-3xl flex max-w-screen-2xl shrink-0 grow basis-0 flex-wrap items-center justify-between gap-12">
        <div className="flex min-w-60 max-w-sm flex-1 items-center gap-4">
          <Icon variant="secondary" size="xl" className="shrink-0">
            <Pencil />
          </Icon>
          <span className="font-bold tracking-tight">{'Start a room or jump into one with a code.'}</span>
        </div>
        <div className="flex min-w-60 max-w-sm flex-1 items-center gap-4">
          <Icon variant="secondary" size="xl" className="shrink-0">
            <Plus />
          </Icon>
          <span className="font-bold tracking-tight">{'Feed it any video link. Seriously, go nuts.'}</span>
        </div>
        <div className="flex min-w-60 max-w-sm flex-1 items-center gap-4">
          <Icon variant="secondary" size="xl" className="shrink-0">
            <PartyPopper />
          </Icon>
          <span className="font-bold tracking-tight">{`Roast the video together, perfectly in sync.`}</span>
        </div>
      </div>
    </section>
  );
}

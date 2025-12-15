'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import HowItWorks from '@/components/pages/how-it-works';
import { MoveRight } from 'lucide-react';

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="space-y-6 py-24 text-center md:mt-16">
        <h1 className="mx-auto max-w-5xl text-6xl font-bold tracking-tighter md:text-8xl">{`NO WAIT, PAUSE IT. SOMEONE'S HERE?`}</h1>
        <p className="mx-auto max-w-xl text-3xl font-semibold tracking-tighter text-neutral">
          {`Screw screen-sharing. Spin up rooms, drag in friends, and enjoy synced videos with chat that doesn’t suck.`}
        </p>

        <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
          <Link href="/create">
            <Button size="lg">
              <span>Create Room</span>
            </Button>
          </Link>

          <Link href="/join">
            <Button variant="ghost" size="lg">
              <span>Join Room</span>
            </Button>
          </Link>
        </div>
      </section>

      {/* Experimental Cards */}
      <section className="4xl:4xl:max-w-screen-3xl mx-auto flex w-full max-w-screen-2xl justify-center rounded-md bg-primary/60 px-6 py-24">
        <div className="flex w-full max-w-7xl flex-wrap items-center justify-center gap-12">
          <div className="flex min-w-80 max-w-xl flex-col items-start justify-center gap-12 self-stretch">
            <div className="flex flex-col items-start gap-4">
              <span className="text-4xl font-extrabold tracking-tighter text-primary-foreground">
                Everyone on the same timeline. Literally.
              </span>
              <span className="tracking-tight text-primary-foreground">
                {`Ditch the countdowns. Paste any YouTube or direct video link for flawless sync. You pause, they pause. You skip ahead, they skip ahead. No questions asked.`}
              </span>
            </div>
            <Link href="/create">
              <Button size="lg">Create Room</Button>
            </Link>
          </div>
          <div className="flex shrink-0 grow basis-0 flex-col items-center justify-center self-stretch">
            <div className="h-144 flex w-full min-w-60 max-w-xl flex-col items-center justify-center overflow-hidden rounded-md">
              <img
                className="w-full shrink-0 grow basis-0 object-cover"
                alt="Illustration of a video player timeline being perfectly synced for multiple users."
                src="https://res.cloudinary.com/subframe/image/upload/v1724705524/uploads/302/l5oq75rpdkq2kowa2xkj.png"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="flex w-full justify-center rounded-md px-6 py-24">
        <div className="flex w-full max-w-7xl flex-row-reverse flex-wrap items-center justify-center gap-12">
          <div className="flex min-w-80 max-w-xl flex-col items-start justify-center gap-12 self-stretch">
            <div className="flex flex-col items-start gap-4">
              <span className="text-4xl font-extrabold tracking-tighter text-primary-foreground">
                {`Friends don't make friends create accounts.`}
              </span>
              <span className="tracking-tight text-primary-foreground">
                {`End the playback anarchy. The room's host controls the video for everyone, ensuring a smooth, uninterrupted show. Getting your friends in is just as easy, no sign-ups required. Just share the link and go.`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/create">
                <Button size="lg">Create Room</Button>
              </Link>
              <Link href="/join">
                <Button variant="ghost" size="lg">
                  Join Room
                </Button>
              </Link>
            </div>
          </div>
          <div className="flex shrink-0 grow basis-0 flex-col items-center justify-center self-stretch">
            <div className="h-144 flex w-full min-w-60 max-w-xl flex-col items-center justify-center overflow-hidden rounded-md">
              <img
                className="w-full shrink-0 grow basis-0 object-cover"
                src="https://res.cloudinary.com/subframe/image/upload/v1724690133/uploads/302/tswlwr0qfwwhkgbjwplw.png"
                alt="Illustration showing friends enjoying a watch party without needing to sign up."
              />
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <HowItWorks />

      {/* CTA */}
      <section className="flex w-full shrink-0 grow basis-0 flex-col items-center justify-center gap-2 py-24">
        <div className="4xl:max-w-screen-3xl flex w-full max-w-screen-2xl flex-col items-center justify-center gap-8 rounded-lg bg-primary-900 px-6 pb-16 pt-28">
          <div className="flex w-full flex-col items-center justify-center gap-6 py-12">
            <span className="w-full max-w-3xl whitespace-pre-wrap text-center text-5xl font-extrabold tracking-tighter text-primary-300 md:text-7xl md:font-bold">
              {`OH C'MON, GO AHEAD AND TRY IT OUT, HELP A JOBLESS FRIEND :)`}
            </span>
            <span className="w-full max-w-3xl whitespace-pre-wrap text-center font-bold tracking-tighter text-black">
              {
                'Also tinkering with listening parties, study rooms, and real-time collabs - all built for absurdly low latency. Because input lag is the enemy.'
              }
            </span>
          </div>
          <Link href="/create">
            <Button variant="secondary" size="lg" className="flex gap-2">
              {`Yay! Let's Go`}
              <MoveRight />
            </Button>
          </Link>
        </div>
      </section>
    </>
  );
}

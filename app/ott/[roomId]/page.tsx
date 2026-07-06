'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Loader2, MonitorPlay, CircleX } from 'lucide-react';

const CHROME_STORE_URL = 'https://chrome.google.com/webstore/detail/sideby-pass';

export default function OttRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params); // Next.js 15: params is a Promise — must use React.use()

  const router = useRouter();
  const [roomData, setRoomData] = useState<{ ottUrl: string; roomType: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [extensionDetected, setExtensionDetected] = useState<boolean | null>(null);
  const [manualJoinFeedback, setManualJoinFeedback] = useState<string | null>(null);

  // Effect 1: Fetch room data from sync.sideby.me
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_SYNC_URL}/api/rooms/${roomId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { ottUrl: string; roomType: string }) => setRoomData(data))
      .catch((err: unknown) => {
        if (err === 404) setNotFound(true);
        else setFetchError(true);
      });
  }, [roomId]);

  // Effect 2: Extension detection via DOM marker — document only accessible client-side
  useEffect(() => {
    const timeout = setTimeout(() => {
      const detected = document.documentElement.dataset.sidebyExt === '1';
      setExtensionDetected(detected);
    }, 100);
    return () => clearTimeout(timeout);
  }, []);

  // Effect 3: Redirect when both room data and extension are resolved
  useEffect(() => {
    if (roomData && extensionDetected === true && roomData.ottUrl) {
      // Arm the joiner's pending_join on THIS tab before the same-tab
      // redirect to Netflix. watch-marker.ts (ISOLATED content script, listening
      // since document_start) receives this CustomEvent and sends PENDING_OTT_JOIN
      // to the background, which writes pending_join_${tabId}. Because router.replace
      // is a same-tab top-level navigation, the record survives the redirect and the
      // existing 10-16 onCommitted/onHistoryStateUpdated listeners fire performOttJoin
      // on the Netflix /watch/* page. Dispatched only inside the extensionDetected ===
      // true branch, so a listener (the extension) is guaranteed present.
      window.dispatchEvent(new CustomEvent('sideby:ott-join', { detail: { roomId } }));
      router.replace(`${roomData.ottUrl}?sideby_room=${encodeURIComponent(roomId)}`);
    }
  }, [roomData, extensionDetected, roomId, router]);

  // Effect 4: Poll for extension detection when initially not found
  useEffect(() => {
    if (extensionDetected === false && roomData) {
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        if (document.documentElement.dataset.sidebyExt === '1') {
          clearInterval(poll);
          setExtensionDetected(true);
        } else if (attempts >= 20) {
          // ~10s at 500ms intervals — stop polling
          clearInterval(poll);
        }
      }, 500);
      return () => clearInterval(poll);
    }
  }, [extensionDetected, roomData]);

  // Fetch error state: non-404 failure (network, CORS, 5xx)
  if (fetchError) {
    return (
      <div className="px-4 py-6 sm:px-8 sm:py-8 lg:px-14 lg:py-14">
        <Card className="mx-auto flex max-w-screen-2xl flex-col items-center justify-center gap-6 rounded-lg border border-border bg-background p-6 sm:gap-8 sm:p-12 lg:gap-12 lg:p-24">
          <Icon size="xl" variant="secondary">
            <CircleX />
          </Icon>
          <h1 className="whitespace-pre-wrap text-4xl font-bold tracking-tighter sm:text-6xl lg:text-8xl">
            Something Went Wrong
          </h1>
          <p className="text-sm font-bold tracking-tight text-neutral-400 sm:text-base" role="alert">
            Couldn&apos;t load the room. Check your connection and try again.
          </p>
          <Button size="lg" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  // Loading state: awaiting room fetch, extension detection, OR the redirect to
  // Netflix (extensionDetected === true). Including the `=== true` case keeps the
  // loading screen on-screen while Effect 3's router.replace runs post-paint —
  // otherwise the install CTA would flash for one frame before the redirect.
  if (!notFound && (!roomData || extensionDetected !== false)) {
    return (
      <div className="px-4 py-6 sm:px-8 sm:py-8 lg:px-14 lg:py-14">
        <Card className="mx-auto flex max-w-screen-2xl flex-col items-center justify-center gap-6 rounded-lg border border-border bg-background p-6 sm:gap-8 sm:p-12 lg:gap-12 lg:p-24">
          <Icon size="xl" variant="secondary" aria-label="Loading">
            <Loader2 className="animate-spin" />
          </Icon>
          <h1 className="whitespace-pre-wrap text-4xl font-bold tracking-tighter sm:text-6xl lg:text-8xl">
            Joining Room...
          </h1>
          <p className="text-sm font-bold tracking-tight text-neutral-400 sm:text-base">
            Getting things ready, just a second.
          </p>
        </Card>
      </div>
    );
  }

  // Room not found state
  if (notFound) {
    return (
      <div className="px-4 py-6 sm:px-8 sm:py-8 lg:px-14 lg:py-14">
        <Card className="mx-auto flex max-w-screen-2xl flex-col items-center justify-center gap-6 rounded-lg border border-border bg-background p-6 sm:gap-8 sm:p-12 lg:gap-12 lg:p-24">
          <Icon size="xl" variant="secondary">
            <CircleX />
          </Icon>
          <h1 className="whitespace-pre-wrap text-4xl font-bold tracking-tighter sm:text-6xl lg:text-8xl">
            Room Not Found
          </h1>
          <p className="text-sm font-bold tracking-tight text-neutral-400 sm:text-base" role="alert">
            This room doesn&apos;t exist or may have expired. Ask the host to create a new one.
          </p>
        </Card>
      </div>
    );
  }

  // Install CTA state: extension not detected but room data loaded
  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8 lg:px-14 lg:py-14">
      <Card className="mx-auto flex max-w-screen-2xl flex-col items-center justify-center gap-6 rounded-lg border border-border bg-background p-6 sm:gap-8 sm:p-12 lg:gap-12 lg:p-24">
        <Icon size="xl" variant="secondary">
          <MonitorPlay />
        </Icon>
        <h1 className="whitespace-pre-wrap text-4xl font-bold tracking-tighter sm:text-6xl lg:text-8xl">
          Get the Extension First
        </h1>
        <div className="flex w-full flex-col items-center justify-center gap-2 text-center sm:gap-4">
          <h2 className="text-2xl font-extrabold tracking-tighter text-primary sm:text-3xl">Almost there</h2>
          <p className="text-sm font-bold tracking-tight text-neutral-400 sm:text-base">
            Install the sideby extension to join the Netflix watch party.
          </p>
        </div>
        <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer">
              Get Extension
            </a>
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => {
              const detected = document.documentElement.dataset.sidebyExt === '1';
              if (detected) {
                setExtensionDetected(true);
              } else {
                setManualJoinFeedback('Refresh the page after installing.');
              }
            }}
          >
            Already have it? Join now
          </Button>
        </div>
        {manualJoinFeedback && (
          <p className="text-sm font-bold tracking-tight text-neutral-400 sm:text-base" role="alert">
            {manualJoinFeedback}
          </p>
        )}
      </Card>
    </div>
  );
}

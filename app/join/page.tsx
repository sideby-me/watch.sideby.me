'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AtSign, Hash, Users, MessageCircle, Eye, LucideIcon, Crown, Dices } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useJoinRoom } from '@/hooks/use-join-room';
import { Icon } from '@/components/ui/icon';
import HowItWorks from '@/components/pages/how-it-works';
import { generateQuirkyName } from '@/lib/name-generator';

const JOIN_FEATURES = [
  {
    icon: Eye,
    title: 'Gasp at the exact moment',
  },
  {
    icon: MessageCircle,
    title: 'Share your hot takes',
  },
  {
    icon: Crown,
    title: 'Politely ask for the remote',
  },
] as const;

function FeatureCard({ icon: IconComponent, title }: { icon: LucideIcon; title: string }) {
  return (
    <Card className="border-neutral-border bg-default-background flex w-full flex-none flex-col items-start gap-4 rounded-md border-solid px-4 py-4 shadow-sm sm:w-40">
      <IconComponent className="text-heading-3 font-heading-3 text-primary" />
      <span className="line-clamp-2 w-full text-sm tracking-tight text-neutral sm:text-base">{title}</span>
    </Card>
  );
}

export default function JoinRoomPage() {
  const {
    roomId,
    userName,
    setUserName,
    isLoading,
    error,
    isConnected,
    isInitialized,
    handleJoinRoom,
    handleRoomIdChange,
  } = useJoinRoom();
  // Keep a deterministic placeholder for SSR and update to a random one on the client
  const [placeholder, setPlaceholder] = useState<string>('e.g., Silly Penguin');

  const handleGenerateName = useCallback(() => {
    const name = generateQuirkyName();
    setUserName(name);
    setPlaceholder(`e.g., ${name}`);
  }, [setUserName]);

  useEffect(() => {
    setPlaceholder(`e.g., ${generateQuirkyName()}`);
  }, []);

  return (
    <>
      <div className="px-4 py-6 sm:px-8 sm:py-8 lg:px-14 lg:py-14">
        <Card className="mx-auto flex max-w-screen-2xl flex-col items-center justify-center gap-6 rounded-lg border border-border bg-background p-6 sm:gap-8 sm:p-12 lg:gap-12 lg:p-24">
          {/* Header Section */}
          <header className="flex w-full shrink-0 grow basis-0 flex-col items-center justify-center gap-6 sm:gap-8 lg:gap-12">
            <div className="flex w-full shrink-0 grow basis-0 flex-col items-center justify-center gap-4">
              <Icon size="xl" variant="secondary">
                <Users />
              </Icon>
              <h1 className="whitespace-pre-wrap text-4xl font-bold tracking-tighter sm:text-6xl lg:text-8xl">
                Join Room
              </h1>
            </div>

            {/* Form Section */}
            <div className="flex w-full shrink-0 grow basis-0 flex-col items-center justify-center gap-4">
              <div className="flex w-full flex-col items-start justify-center gap-2 sm:gap-4">
                <h2 className="text-2xl font-extrabold tracking-tighter text-primary sm:text-3xl lg:text-4xl">
                  Player +1
                </h2>
                <p className="text-sm font-bold tracking-tight text-neutral-400 sm:text-base">
                  Just need the room code and your callsign to get you in.
                </p>
              </div>

              <form onSubmit={handleJoinRoom} className="w-full space-y-4">
                {/* Room ID Input */}
                <div className="w-full space-y-2">
                  <Label htmlFor="roomId" className="text-sm font-bold tracking-tight sm:text-base">
                    Room ID
                  </Label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-neutral" />
                    <Input
                      id="roomId"
                      name="roomId"
                      type="text"
                      value={roomId}
                      onChange={handleRoomIdChange}
                      placeholder="ABC123"
                      className="pl-10 text-center font-mono text-base tracking-widest sm:text-lg"
                      maxLength={6}
                      required
                      disabled={isLoading || !isConnected}
                      aria-describedby={error ? 'error-message' : undefined}
                    />
                  </div>
                  <p className="text-xs text-neutral-400">{`It's case-sensitive, so get it right!`}</p>
                </div>

                {/* Name Input */}
                <div className="w-full space-y-2">
                  <Label htmlFor="userName" className="text-sm font-bold tracking-tight sm:text-base">
                    Your Callsign
                  </Label>
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-neutral" />
                      <Input
                        id="userName"
                        name="userName"
                        type="text"
                        value={userName}
                        onChange={e => setUserName(e.target.value)}
                        placeholder={placeholder}
                        className="pl-10 text-base tracking-tight sm:text-lg"
                        maxLength={50}
                        required
                        disabled={isLoading || !isConnected}
                        aria-describedby={error ? 'error-message' : undefined}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleGenerateName}
                      disabled={isLoading || !isConnected}
                      title="Generate random name"
                      className="shrink-0"
                    >
                      <Dices className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Error Display */}
                {error && (
                  <div id="error-message" className="text-sm font-medium text-red-500" role="alert">
                    {error}
                  </div>
                )}

                {/* Connection Status */}
                {!isInitialized && <div className="text-sm font-medium text-yellow-500">Waking up the servers...</div>}
                {isInitialized && !isConnected && (
                  <div className="text-sm font-medium text-red-500">
                    Whoops, looks like you lost connection. Try a quick refresh?
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:gap-4">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full sm:w-auto"
                    disabled={isLoading || !isConnected || !roomId.trim() || !userName.trim()}
                  >
                    {isLoading ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
                        Joining Room...
                      </>
                    ) : (
                      <>
                        <Users className="mr-2 h-4 w-4" />
                        Join Room
                      </>
                    )}
                  </Button>
                  <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                    <Link href="/create">Want to host?</Link>
                  </Button>
                </div>
              </form>
            </div>
          </header>

          {/* Divider */}
          <div className="flex h-px w-full flex-none flex-col items-center bg-border" />

          {/* Features Section */}
          <section className="flex w-full flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap lg:flex-nowrap">
            {JOIN_FEATURES.map((feature, index) => (
              <FeatureCard key={index} icon={feature.icon} title={feature.title} />
            ))}
          </section>
        </Card>
      </div>

      {/* How it works */}
      <HowItWorks />
    </>
  );
}

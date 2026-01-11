'use client';

import { useParams } from 'next/navigation';
import { RoomShell } from '@/src/features/room/components/RoomShell';

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;

  return <RoomShell roomId={roomId} />;
}

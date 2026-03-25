import { redis } from '../client';
import type { PickerCandidate } from '@/types';

export interface PickerState {
  candidates: PickerCandidate[];
  winnerPlaybackUrl: string;
  expiresAt: number;
  reason: 'lowConfidence' | 'ambiguous' | 'both';
  createdAt: number;
}

const PICKER_TTL_SECONDS = 65; // 5s buffer over the 60s window

export class PickerRepository {
  private static instance: PickerRepository;

  static getInstance(): PickerRepository {
    if (!PickerRepository.instance) {
      PickerRepository.instance = new PickerRepository();
    }
    return PickerRepository.instance;
  }

  async setPickerState(roomId: string, state: PickerState): Promise<void> {
    await redis.setex(`picker:${roomId}`, PICKER_TTL_SECONDS, JSON.stringify(state));
  }

  async getPickerState(roomId: string): Promise<PickerState | null> {
    const data = await redis.get(`picker:${roomId}`);
    if (!data) return null;
    return JSON.parse(data) as PickerState;
  }

  async deletePickerState(roomId: string): Promise<void> {
    await redis.del(`picker:${roomId}`);
  }
}

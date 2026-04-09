import { afterEach, describe, expect, it, vi } from 'vitest';

const { getRoomMock, setVideoUrlMock } = vi.hoisted(() => ({
  getRoomMock: vi.fn(),
  setVideoUrlMock: vi.fn(),
}));

vi.mock('@/server/redis', () => ({
  redisService: {
    rooms: {
      getRoom: getRoomMock,
      setVideoUrl: setVideoUrlMock,
    },
  },
}));

import { dispatch } from '../../server/video/dispatch';
import * as dispatchModule from '../../server/video/dispatch';
import { VideoService } from '../../server/services/VideoService';

describe('socket entry correlation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    getRoomMock.mockReset();
    setVideoUrlMock.mockReset();
  });

  it('dispatch function receives correlation context parameter', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return;
    });

    await dispatch('https://youtube.com/watch?v=dQw4w9WgXcQ', undefined, {
      requestId: 'req-1',
      dispatchId: 'disp-1',
      traceId: 'trace-1',
      spanId: 'span-1',
      roomId: 'room-1',
      userId: 'user-1',
    });

    const payloads = logSpy.mock.calls
      .map(call => String(call[0] ?? ''))
      .filter(Boolean)
      .map(line => JSON.parse(line) as Record<string, unknown>);

    const event = payloads.find(payload => payload.event === 'dispatch_youtube');

    expect(event?.request_id).toBe('req-1');
    expect(event?.dispatch_id).toBe('disp-1');
  });

  it('dispatch logs include request_id, dispatch_id, trace_id, and span_id', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return;
    });

    await dispatch('https://youtube.com/watch?v=dQw4w9WgXcQ', undefined, {
      requestId: 'req-2',
      dispatchId: 'disp-2',
      traceId: 'trace-2',
      spanId: 'span-2',
      roomId: 'room-2',
      userId: 'user-2',
    });

    const payloads = logSpy.mock.calls
      .map(call => String(call[0] ?? ''))
      .filter(Boolean)
      .map(line => JSON.parse(line) as Record<string, unknown>);

    const event = payloads.find(payload => payload.event === 'dispatch_youtube');

    expect(event?.request_id).toBe('req-2');
    expect(event?.dispatch_id).toBe('disp-2');
    expect(event?.trace_id).toBe('trace-2');
    expect(event?.span_id).toBe('span-2');
  });

  it('dispatch logs include room_id and user_id when available', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return;
    });

    await dispatch('https://youtube.com/watch?v=dQw4w9WgXcQ', undefined, {
      requestId: 'req-3',
      dispatchId: 'disp-3',
      traceId: 'trace-3',
      spanId: 'span-3',
      roomId: 'room-3',
      userId: 'user-3',
    });

    const payloads = logSpy.mock.calls
      .map(call => String(call[0] ?? ''))
      .filter(Boolean)
      .map(line => JSON.parse(line) as Record<string, unknown>);

    const event = payloads.find(payload => payload.event === 'dispatch_youtube');

    expect(event?.room_id).toBe('room-3');
    expect(event?.user_id).toBe('user-3');
  });

  it('missing room_id/user_id triggers warning log and does not throw', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      return;
    });

    await expect(
      dispatch('https://youtube.com/watch?v=dQw4w9WgXcQ', undefined, {
        requestId: 'req-4',
        dispatchId: 'disp-4',
        traceId: 'trace-4',
        spanId: 'span-4',
      })
    ).resolves.toBeDefined();

    const warnPayloads = warnSpy.mock.calls
      .map(call => String(call[0] ?? ''))
      .filter(Boolean)
      .map(line => JSON.parse(line) as Record<string, unknown>);

    const warning = warnPayloads.find(payload => payload.event === 'dispatch_missing_non_core_ids');

    expect(warning).toBeDefined();
    expect(warning?.request_id).toBe('req-4');
  });

  it('VideoService.setVideo passes correlation context to dispatch', async () => {
    const dispatchSpy = vi.spyOn(dispatchModule, 'dispatch').mockResolvedValue({
      originalUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
      playbackUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
      deliveryType: 'youtube',
      videoType: 'youtube',
    });

    getRoomMock.mockResolvedValue({
      users: [{ id: 'host-1', isHost: true }],
      videoState: { isPlaying: false, currentTime: 0, duration: 0, lastUpdateTime: Date.now() },
    });
    setVideoUrlMock.mockResolvedValue(undefined);

    const correlation = {
      requestId: 'req-5',
      dispatchId: 'disp-5',
      traceId: 'trace-5',
      spanId: 'span-5',
      roomId: 'room-5',
      userId: 'host-1',
    };

    await VideoService.setVideo(
      { roomId: 'room-5', videoUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ' },
      { userId: 'host-1', roomId: 'room-5', userName: 'Host' },
      undefined,
      correlation
    );

    expect(dispatchSpy).toHaveBeenCalledWith('https://youtube.com/watch?v=dQw4w9WgXcQ', undefined, correlation);
  });
});

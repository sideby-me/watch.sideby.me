'use client';

import { useCallback, useState } from 'react';

export interface MediaPermissionState {
  mic: PermissionState | 'unavailable';
  camera: PermissionState | 'unavailable';
}

export interface UseMediaPermissionsReturn {
  permissions: MediaPermissionState;
  micAllowed: boolean;
  cameraAllowed: boolean;
  requestMic: () => Promise<MediaStream | null>;
  requestCamera: (withAudio?: boolean) => Promise<MediaStream | null>;
  reset: () => void;
}

// Hook focused on media permission acquisition and status tracking
export function useMediaPermissions(): UseMediaPermissionsReturn {
  const [permissions, setPermissions] = useState<MediaPermissionState>({ mic: 'unavailable', camera: 'unavailable' });

  const updatePermission = useCallback(async (name: 'microphone' | 'camera') => {
    try {
      // navigator.permissions is not fully supported for camera in all browsers
      if (!('permissions' in navigator) || !navigator.permissions.query) return;
      const status = await navigator.permissions.query({ name } as PermissionDescriptor);
      setPermissions(p => ({ ...p, [name === 'microphone' ? 'mic' : 'camera']: status.state }));
      status.onchange = () => {
        setPermissions(p => ({ ...p, [name === 'microphone' ? 'mic' : 'camera']: status.state }));
      };
    } catch {
      /* ignore */
    }
  }, []);

  const requestMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      await updatePermission('microphone');
      return stream;
    } catch {
      await updatePermission('microphone');
      return null;
    }
  }, [updatePermission]);

  const requestCamera = useCallback(
    async (withAudio: boolean = false) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: withAudio });
        await updatePermission('camera');
        if (withAudio) await updatePermission('microphone');
        return stream;
      } catch {
        await updatePermission('camera');
        if (withAudio) await updatePermission('microphone');
        return null;
      }
    },
    [updatePermission]
  );

  const reset = useCallback(() => {
    setPermissions({ mic: 'unavailable', camera: 'unavailable' });
  }, []);

  return {
    permissions,
    micAllowed: permissions.mic === 'granted',
    cameraAllowed: permissions.camera === 'granted',
    requestMic,
    requestCamera,
    reset,
  };
}

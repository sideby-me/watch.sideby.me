/* eslint-disable @typescript-eslint/no-namespace */

// Extend Window interface
interface Window {
  __onGCastApiAvailable?: (isAvailable: boolean) => void;
  cast?: {
    framework: typeof cast.framework;
  };
  chrome?: {
    cast: typeof chrome.cast;
  };
}

// Top-level namespace for chrome.cast
declare namespace chrome.cast {
  enum AutoJoinPolicy {
    TAB_AND_ORIGIN_SCOPED = 'tab_and_origin_scoped',
    ORIGIN_SCOPED = 'origin_scoped',
    PAGE_SCOPED = 'page_scoped',
  }

  enum DefaultActionPolicy {
    CREATE_SESSION = 'create_session',
    CAST_THIS_TAB = 'cast_this_tab',
  }

  enum ReceiverAvailability {
    AVAILABLE = 'available',
    UNAVAILABLE = 'unavailable',
  }

  enum SessionStatus {
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected',
    STOPPED = 'stopped',
  }

  class SessionRequest {
    constructor(appId: string);
    appId: string;
  }

  class ApiConfig {
    constructor(
      sessionRequest: SessionRequest,
      sessionListener: (session: Session) => void,
      receiverListener: (availability: ReceiverAvailability) => void,
      autoJoinPolicy?: AutoJoinPolicy,
      defaultActionPolicy?: DefaultActionPolicy
    );
  }

  interface Session {
    sessionId: string;
    status: SessionStatus;
    receiver: Receiver;
    media: Media[];
    loadMedia(loadRequest: media.LoadRequest, successCallback: () => void, errorCallback: (error: Error) => void): void;
  }

  interface Receiver {
    friendlyName: string;
    label: string;
  }

  interface Media {
    currentTime: number;
    duration: number;
    playerState: media.PlayerState;
    play(
      playRequest: media.PlayRequest | null,
      successCallback: () => void,
      errorCallback: (error: Error) => void
    ): void;
    pause(
      pauseRequest: media.PauseRequest | null,
      successCallback: () => void,
      errorCallback: (error: Error) => void
    ): void;
    seek(seekRequest: media.SeekRequest, successCallback: () => void, errorCallback: (error: Error) => void): void;
  }

  interface Error {
    code: string;
    description: string;
  }

  function initialize(apiConfig: ApiConfig, successCallback: () => void, errorCallback: (error: Error) => void): void;

  function requestSession(successCallback: (session: Session) => void, errorCallback: (error: Error) => void): void;

  namespace media {
    enum PlayerState {
      IDLE = 'IDLE',
      PLAYING = 'PLAYING',
      PAUSED = 'PAUSED',
      BUFFERING = 'BUFFERING',
    }

    enum StreamType {
      BUFFERED = 'BUFFERED',
      LIVE = 'LIVE',
      OTHER = 'OTHER',
    }

    class MediaInfo {
      constructor(contentId: string, contentType: string);
      contentId: string;
      contentType: string;
      streamType: StreamType;
      duration?: number;
      metadata?: GenericMediaMetadata;
    }

    class GenericMediaMetadata {
      title?: string;
      subtitle?: string;
      images?: Image[];
    }

    interface Image {
      url: string;
      width?: number;
      height?: number;
    }

    class LoadRequest {
      constructor(mediaInfo: MediaInfo);
      mediaInfo: MediaInfo;
      autoplay: boolean;
      currentTime: number;
    }

    class PlayRequest {}
    class PauseRequest {}

    class SeekRequest {
      currentTime: number;
    }
  }
}

// Top-level namespace for cast.framework
declare namespace cast.framework {
  enum CastState {
    NO_DEVICES_AVAILABLE = 'NO_DEVICES_AVAILABLE',
    NOT_CONNECTED = 'NOT_CONNECTED',
    CONNECTING = 'CONNECTING',
    CONNECTED = 'CONNECTED',
  }

  enum SessionState {
    NO_SESSION = 'NO_SESSION',
    SESSION_STARTING = 'SESSION_STARTING',
    SESSION_STARTED = 'SESSION_STARTED',
    SESSION_START_FAILED = 'SESSION_START_FAILED',
    SESSION_ENDING = 'SESSION_ENDING',
    SESSION_ENDED = 'SESSION_ENDED',
    SESSION_RESUMED = 'SESSION_RESUMED',
  }

  enum RemotePlayerEventType {
    ANY_CHANGE = 'anyChanged',
    IS_CONNECTED_CHANGED = 'isConnectedChanged',
    IS_MEDIA_LOADED_CHANGED = 'isMediaLoadedChanged',
    DURATION_CHANGED = 'durationChanged',
    CURRENT_TIME_CHANGED = 'currentTimeChanged',
    IS_PAUSED_CHANGED = 'isPausedChanged',
    VOLUME_LEVEL_CHANGED = 'volumeLevelChanged',
    IS_MUTED_CHANGED = 'isMutedChanged',
    CAN_PAUSE_CHANGED = 'canPauseChanged',
    CAN_SEEK_CHANGED = 'canSeekChanged',
    DISPLAY_NAME_CHANGED = 'displayNameChanged',
    STATUS_TEXT_CHANGED = 'statusTextChanged',
    TITLE_CHANGED = 'titleChanged',
    DISPLAY_STATUS_CHANGED = 'displayStatusChanged',
    MEDIA_INFO_CHANGED = 'mediaInfoChanged',
    IMAGE_URL_CHANGED = 'imageUrlChanged',
    PLAYER_STATE_CHANGED = 'playerStateChanged',
  }

  interface CastOptions {
    receiverApplicationId: string;
    autoJoinPolicy?: chrome.cast.AutoJoinPolicy;
    resumeSavedSession?: boolean;
  }

  class CastContext {
    static getInstance(): CastContext;
    setOptions(options: CastOptions): void;
    getCastState(): CastState;
    getSessionState(): SessionState;
    getCurrentSession(): CastSession | null;
    requestSession(): Promise<void>;
    endCurrentSession(stopCasting: boolean): void;
    addEventListener(type: CastContextEventType, handler: (event: CastStateEventData) => void): void;
    removeEventListener(type: CastContextEventType, handler: (event: CastStateEventData) => void): void;
  }

  enum CastContextEventType {
    CAST_STATE_CHANGED = 'caststatechanged',
    SESSION_STATE_CHANGED = 'sessionstatechanged',
  }

  interface CastStateEventData {
    castState: CastState;
    sessionState?: SessionState;
  }

  class CastSession {
    getSessionId(): string;
    getCastDevice(): CastDevice;
    getSessionState(): SessionState;
    loadMedia(request: chrome.cast.media.LoadRequest): Promise<void>;
    endSession(stopCasting: boolean): void;
  }

  interface CastDevice {
    friendlyName: string;
  }

  class RemotePlayer {
    isConnected: boolean;
    isMediaLoaded: boolean;
    duration: number;
    currentTime: number;
    isPaused: boolean;
    volumeLevel: number;
    isMuted: boolean;
    canPause: boolean;
    canSeek: boolean;
    displayName: string;
    statusText: string;
    title: string;
    displayStatus: string;
    mediaInfo: chrome.cast.media.MediaInfo | null;
    imageUrl: string;
    playerState: chrome.cast.media.PlayerState;
  }

  class RemotePlayerController {
    constructor(player: RemotePlayer);
    playOrPause(): void;
    stop(): void;
    seek(): void;
    muteOrUnmute(): void;
    setVolumeLevel(): void;
    getSeekPosition(currentTime: number, duration: number): number;
    getSeekTime(position: number, duration: number): number;
    addEventListener(type: RemotePlayerEventType, handler: (event: RemotePlayerChangedEvent) => void): void;
    removeEventListener(type: RemotePlayerEventType, handler: (event: RemotePlayerChangedEvent) => void): void;
  }

  interface RemotePlayerChangedEvent {
    type: RemotePlayerEventType;
    field: string;
    value: unknown;
  }
}

import { z } from 'zod';

// Common validation patterns
export const UserNameSchema = z
  .string()
  .min(2, "Hmm, that name's a little brief. We need a callsign that's at least 2 characters long.")
  .max(20, 'Whoa, what an epic name! Sadly, our little callsign tags can only fit 20 characters.')
  .regex(
    /^[a-zA-Z0-9\s\-_.!?]+$/,
    'Easy on the fancy characters! Our system is a bit sensitive with those special characters.'
  );

export const RoomIdSchema = z
  .string()
  .length(6, 'Room ID must be exactly 6 characters')
  .regex(/^[A-Z0-9]+$/, 'Room ID can only contain uppercase letters and numbers');

export const VideoUrlSchema = z.string().url('Invalid URL format').min(1, 'Video URL is required');

// Base schemas
export const VideoTypeSchema = z.enum(['youtube', 'mp4', 'm3u8']).nullable();

export const VideoStateSchema = z.object({
  isPlaying: z.boolean(),
  currentTime: z.number().min(0),
  duration: z.number().min(0),
  lastUpdateTime: z.number().positive(),
});

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: UserNameSchema,
  isHost: z.boolean(),
  joinedAt: z.date(),
});

export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  userName: UserNameSchema,
  message: z.string().min(1, 'Message cannot be empty').max(1000, 'Message too long'),
  timestamp: z.date(),
  roomId: RoomIdSchema,
  isRead: z.boolean().default(false),
  // System message extensions
  type: z.enum(['user', 'system']).default('user'),
  systemType: z.enum(['join', 'leave', 'kick', 'video-change', 'promote', 'play', 'pause']).optional(),
  eventData: z.record(z.string(), z.any()).optional(),
  // Reactions: emoji
  reactions: z.record(z.string(), z.array(z.string().uuid())).optional().default({}),
  // Reply information
  replyTo: z
    .object({
      messageId: z.string().uuid(),
      userId: z.string().uuid(),
      userName: UserNameSchema,
      message: z.string().max(150),
    })
    .optional(),
});

export const TypingUserSchema = z.object({
  userId: z.string().uuid(),
  userName: UserNameSchema,
  timestamp: z.number().positive(),
});

export const SubtitleTrackSchema = z.object({
  id: z.string(),
  label: z.string(),
  language: z.string(),
  url: z.string().url(),
  format: z.enum(['vtt', 'srt', 'ass']),
  isDefault: z.boolean().default(false),
});

export const RoomSchema = z.object({
  id: RoomIdSchema,
  hostId: z.string().uuid(),
  hostName: UserNameSchema,
  hostToken: z.string().uuid(),
  videoUrl: VideoUrlSchema.optional(),
  videoType: VideoTypeSchema,
  videoState: VideoStateSchema,
  users: z.array(UserSchema),
  createdAt: z.date(),
  // New enriched video metadata
  videoMeta: z
    .object({
      originalUrl: VideoUrlSchema,
      playbackUrl: VideoUrlSchema,
      deliveryType: z.enum(['youtube', 'file-direct', 'file-proxy', 'hls']),
      videoType: z.enum(['youtube', 'mp4', 'm3u8']).nullable(),
      containerHint: z.string().optional(),
      codecWarning: z.string().optional(),
      requiresProxy: z.boolean(),
      decisionReasons: z.array(z.string()),
      probe: z.object({
        status: z.number(),
        contentType: z.string().optional(),
        acceptRanges: z.boolean().optional(),
      }),
      timestamp: z.number(),
    })
    .optional(),
});

// Socket event schemas
export const CreateRoomDataSchema = z.object({
  hostName: UserNameSchema,
});

export const JoinRoomDataSchema = z.object({
  roomId: RoomIdSchema,
  userName: UserNameSchema,
  hostToken: z.string().uuid().optional(),
});

export const SetVideoDataSchema = z.object({
  roomId: RoomIdSchema,
  videoUrl: VideoUrlSchema,
});

export const VideoControlDataSchema = z.object({
  roomId: RoomIdSchema,
  currentTime: z.number().min(0),
});

export const PromoteHostDataSchema = z.object({
  roomId: RoomIdSchema,
  userId: z.string().uuid(),
});

export const SendMessageDataSchema = z.object({
  roomId: RoomIdSchema,
  message: z.string().min(1).max(1000),
  replyTo: z
    .object({
      messageId: z.string().uuid(),
      userId: z.string().uuid(),
      userName: UserNameSchema,
      message: z.string().max(150), // Truncated version for display
    })
    .optional(),
});

// Message reaction (client -> server)
export const MessageReactionDataSchema = z.object({
  roomId: RoomIdSchema,
  messageId: z.string().uuid(),
  emoji: z.string().min(1).max(8), // allow multi codepoint emoji clusters
});

export const SyncCheckDataSchema = z.object({
  roomId: RoomIdSchema,
  currentTime: z.number().min(0),
  isPlaying: z.boolean(),
  timestamp: z.number().positive(),
});

export const RoomActionDataSchema = z.object({
  roomId: RoomIdSchema,
});

export const KickUserDataSchema = z.object({
  roomId: RoomIdSchema,
  userId: z.string().uuid(),
});

// Voice chat schemas
export const VoiceJoinDataSchema = z.object({
  roomId: RoomIdSchema,
});

export const VoiceLeaveDataSchema = z.object({
  roomId: RoomIdSchema,
});

export const VoicePeerJoinResponseSchema = z.object({
  userId: z.string().uuid(),
});

export const VoiceOfferSchema = z.object({
  roomId: RoomIdSchema,
  targetUserId: z.string().uuid(),
  sdp: z.any(),
});

export const VoiceAnswerSchema = z.object({
  roomId: RoomIdSchema,
  targetUserId: z.string().uuid(),
  sdp: z.any(),
});

export const VoiceIceCandidateSchema = z.object({
  roomId: RoomIdSchema,
  targetUserId: z.string().uuid(),
  candidate: z.any(),
});

export const VoicePeerLeaveResponseSchema = z.object({
  userId: z.string().uuid(),
});

export const VoiceErrorResponseSchema = z.object({
  error: z.string(),
});

export const VoiceExistingPeersResponseSchema = z.object({
  userIds: z.array(z.string().uuid()),
});

export const VoiceParticipantCountResponseSchema = z.object({
  roomId: RoomIdSchema,
  count: z.number().int().min(0),
  max: z.number().int().min(1).optional(),
});

// Incoming signaling event payloads (from server)
export const VoiceOfferEventResponseSchema = z.object({
  fromUserId: z.string().uuid(),
  sdp: z.any(),
});

export const VoiceAnswerEventResponseSchema = z.object({
  fromUserId: z.string().uuid(),
  sdp: z.any(),
});

export const VoiceIceCandidateEventResponseSchema = z.object({
  fromUserId: z.string().uuid(),
  candidate: z.any(),
});

// Video Chat (camera) schemas (mirrors voice but video-only track)
export const VideoChatJoinDataSchema = z.object({
  roomId: RoomIdSchema,
});

export const VideoChatLeaveDataSchema = z.object({
  roomId: RoomIdSchema,
});

export const VideoChatOfferSchema = z.object({
  roomId: RoomIdSchema,
  targetUserId: z.string().uuid(),
  sdp: z.any(),
});

export const VideoChatAnswerSchema = z.object({
  roomId: RoomIdSchema,
  targetUserId: z.string().uuid(),
  sdp: z.any(),
});

export const VideoChatIceCandidateSchema = z.object({
  roomId: RoomIdSchema,
  targetUserId: z.string().uuid(),
  candidate: z.any(),
});

export const VideoChatExistingPeersResponseSchema = z.object({
  userIds: z.array(z.string().uuid()),
});

export const VideoChatPeerJoinResponseSchema = z.object({
  userId: z.string().uuid(),
});

export const VideoChatPeerLeaveResponseSchema = z.object({
  userId: z.string().uuid(),
});

export const VideoChatErrorResponseSchema = z.object({
  error: z.string(),
});

export const VideoChatParticipantCountResponseSchema = z.object({
  roomId: RoomIdSchema,
  count: z.number().int().min(0),
  max: z.number().int().min(1).optional(),
});

export const VideoChatOfferEventResponseSchema = z.object({
  fromUserId: z.string().uuid(),
  sdp: z.any(),
});

export const VideoChatAnswerEventResponseSchema = z.object({
  fromUserId: z.string().uuid(),
  sdp: z.any(),
});

export const VideoChatIceCandidateEventResponseSchema = z.object({
  fromUserId: z.string().uuid(),
  candidate: z.any(),
});

// Response schemas
export const RoomCreatedResponseSchema = z.object({
  roomId: RoomIdSchema,
  room: RoomSchema,
  hostToken: z.string().uuid(),
});

export const RoomJoinedResponseSchema = z.object({
  room: RoomSchema,
  user: UserSchema,
});

export const UserJoinedResponseSchema = z.object({
  user: UserSchema,
});

export const UserLeftResponseSchema = z.object({
  userId: z.string().uuid(),
});

export const UserPromotedResponseSchema = z.object({
  userId: z.string().uuid(),
  userName: UserNameSchema,
});

export const UserKickedResponseSchema = z.object({
  userId: z.string().uuid(),
  userName: UserNameSchema,
  kickedBy: z.string().uuid().optional(),
});

export const VideoSetResponseSchema = z.object({
  videoUrl: VideoUrlSchema,
  videoType: z.enum(['youtube', 'mp4', 'm3u8']),
  videoMeta: RoomSchema.shape.videoMeta.optional(),
});

export const VideoEventResponseSchema = z.object({
  currentTime: z.number().min(0),
  timestamp: z.number().positive(),
});

export const SyncUpdateResponseSchema = z.object({
  currentTime: z.number().min(0),
  isPlaying: z.boolean(),
  timestamp: z.number().positive(),
});

export const NewMessageResponseSchema = z.object({
  message: ChatMessageSchema,
});

export const ReactionUpdatedResponseSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z.string(),
  userId: z.string().uuid(),
  // Full reactions map after update (allows client to stay in sync)
  reactions: z.record(z.string(), z.array(z.string().uuid())),
  action: z.enum(['added', 'removed']),
});

export const TypingEventResponseSchema = z.object({
  userId: z.string().uuid(),
  userName: UserNameSchema,
});

export const ErrorResponseSchema = z.object({
  error: z.string().min(1),
});

// Video error report (client -> server for late failure handling)
export const VideoErrorReportSchema = z.object({
  roomId: RoomIdSchema,
  code: z.number().int().optional(),
  message: z.string().optional(),
  currentSrc: VideoUrlSchema,
  currentTime: z.number().min(0).optional(),
});

// Type inference from schemas
export type User = z.infer<typeof UserSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type TypingUser = z.infer<typeof TypingUserSchema>;
export type VideoState = z.infer<typeof VideoStateSchema>;
export type VideoType = z.infer<typeof VideoTypeSchema>;
export type SubtitleTrack = z.infer<typeof SubtitleTrackSchema>;

// Socket event data types
export type CreateRoomData = z.infer<typeof CreateRoomDataSchema>;
export type JoinRoomData = z.infer<typeof JoinRoomDataSchema>;
export type SetVideoData = z.infer<typeof SetVideoDataSchema>;
export type VideoControlData = z.infer<typeof VideoControlDataSchema>;
export type PromoteHostData = z.infer<typeof PromoteHostDataSchema>;
export type SendMessageData = z.infer<typeof SendMessageDataSchema>;
export type MessageReactionData = z.infer<typeof MessageReactionDataSchema>;
export type SyncCheckData = z.infer<typeof SyncCheckDataSchema>;
export type RoomActionData = z.infer<typeof RoomActionDataSchema>;
export type KickUserData = z.infer<typeof KickUserDataSchema>;

// Response types
export type RoomCreatedResponse = z.infer<typeof RoomCreatedResponseSchema>;
export type RoomJoinedResponse = z.infer<typeof RoomJoinedResponseSchema>;
export type UserJoinedResponse = z.infer<typeof UserJoinedResponseSchema>;
export type UserLeftResponse = z.infer<typeof UserLeftResponseSchema>;
export type UserPromotedResponse = z.infer<typeof UserPromotedResponseSchema>;
export type UserKickedResponse = z.infer<typeof UserKickedResponseSchema>;
export type VideoSetResponse = z.infer<typeof VideoSetResponseSchema>;
export type VideoEventResponse = z.infer<typeof VideoEventResponseSchema>;
export type SyncUpdateResponse = z.infer<typeof SyncUpdateResponseSchema>;
export type NewMessageResponse = z.infer<typeof NewMessageResponseSchema>;
export type ReactionUpdatedResponse = z.infer<typeof ReactionUpdatedResponseSchema>;
export type TypingEventResponse = z.infer<typeof TypingEventResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type VideoErrorReport = z.infer<typeof VideoErrorReportSchema>;

// Voice chat types
export type VoiceJoinData = z.infer<typeof VoiceJoinDataSchema>;
export type VoiceLeaveData = z.infer<typeof VoiceLeaveDataSchema>;
export type VoicePeerJoinResponse = z.infer<typeof VoicePeerJoinResponseSchema>;
export type VoiceOffer = z.infer<typeof VoiceOfferSchema>;
export type VoiceAnswer = z.infer<typeof VoiceAnswerSchema>;
export type VoiceIceCandidate = z.infer<typeof VoiceIceCandidateSchema>;
export type VoicePeerLeaveResponse = z.infer<typeof VoicePeerLeaveResponseSchema>;
export type VoiceErrorResponse = z.infer<typeof VoiceErrorResponseSchema>;
export type VoiceExistingPeersResponse = z.infer<typeof VoiceExistingPeersResponseSchema>;
export type VoiceOfferEventResponse = z.infer<typeof VoiceOfferEventResponseSchema>;
export type VoiceAnswerEventResponse = z.infer<typeof VoiceAnswerEventResponseSchema>;
export type VoiceIceCandidateEventResponse = z.infer<typeof VoiceIceCandidateEventResponseSchema>;
export type VoiceParticipantCountResponse = z.infer<typeof VoiceParticipantCountResponseSchema>;

// Video chat types
export type VideoChatJoinData = z.infer<typeof VideoChatJoinDataSchema>;
export type VideoChatLeaveData = z.infer<typeof VideoChatLeaveDataSchema>;
export type VideoChatOffer = z.infer<typeof VideoChatOfferSchema>;
export type VideoChatAnswer = z.infer<typeof VideoChatAnswerSchema>;
export type VideoChatIceCandidate = z.infer<typeof VideoChatIceCandidateSchema>;
export type VideoChatExistingPeersResponse = z.infer<typeof VideoChatExistingPeersResponseSchema>;
export type VideoChatPeerJoinResponse = z.infer<typeof VideoChatPeerJoinResponseSchema>;
export type VideoChatPeerLeaveResponse = z.infer<typeof VideoChatPeerLeaveResponseSchema>;
export type VideoChatErrorResponse = z.infer<typeof VideoChatErrorResponseSchema>;
export type VideoChatParticipantCountResponse = z.infer<typeof VideoChatParticipantCountResponseSchema>;
export type VideoChatOfferEventResponse = z.infer<typeof VideoChatOfferEventResponseSchema>;
export type VideoChatAnswerEventResponse = z.infer<typeof VideoChatAnswerEventResponseSchema>;
export type VideoChatIceCandidateEventResponse = z.infer<typeof VideoChatIceCandidateEventResponseSchema>;

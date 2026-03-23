import { RoomRepository } from './handlers/room';
import { ChatRepository } from './handlers/chat';
import { UserMappingRepository } from './handlers/user-mapping';
import { PickerRepository } from './handlers/picker';

export class RedisService {
  private static instance: RedisService;

  // Expose repositories directly for more flexible access
  public readonly rooms: RoomRepository;
  public readonly chat: ChatRepository;
  public readonly userMapping: UserMappingRepository;
  public readonly picker: PickerRepository;

  private constructor() {
    this.rooms = RoomRepository.getInstance();
    this.chat = ChatRepository.getInstance();
    this.userMapping = UserMappingRepository.getInstance();
    this.picker = PickerRepository.getInstance();
  }

  static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  // Keep only high-level operations that combine multiple repositories
  // or add business logic beyond simple CRUD operations

  async cleanup(): Promise<void> {
    return this.rooms.cleanup();
  }
}

export const redisService = RedisService.getInstance();

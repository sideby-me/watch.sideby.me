// Utility functions for managing session storage data
interface RoomCreatorData {
  roomId: string;
  hostName: string;
  hostToken: string;
  timestamp: number;
}

interface JoinData {
  roomId: string;
  userName: string;
  timestamp: number;
}

const SESSION_TIMEOUT = 300000; // 5 minutes

export const roomSessionStorage = {
  // Store room creator data
  setRoomCreator(data: Omit<RoomCreatorData, 'timestamp'>) {
    if (typeof window === 'undefined') return;

    const storageData: RoomCreatorData = {
      ...data,
      timestamp: Date.now(),
    };

    window.sessionStorage.setItem('room-creator', JSON.stringify(storageData));
  },

  // Get room creator data if valid
  getRoomCreator(roomId: string): RoomCreatorData | null {
    if (typeof window === 'undefined') return null;

    try {
      const data = window.sessionStorage.getItem('room-creator');
      if (!data) return null;

      const parsed: RoomCreatorData = JSON.parse(data);

      // Check if data is recent and for the correct room
      if (parsed.roomId === roomId && Date.now() - parsed.timestamp < SESSION_TIMEOUT) {
        return parsed;
      }

      // Clean up old data
      window.sessionStorage.removeItem('room-creator');
      return null;
    } catch (error) {
      console.error('Error parsing room creator data:', error);
      window.sessionStorage.removeItem('room-creator');
      return null;
    }
  },

  // Store join data
  setJoinData(data: Omit<JoinData, 'timestamp'>) {
    if (typeof window === 'undefined') return;

    const storageData: JoinData = {
      ...data,
      timestamp: Date.now(),
    };

    window.sessionStorage.setItem('join-data', JSON.stringify(storageData));
  },

  // Get join data if valid
  getJoinData(roomId: string): JoinData | null {
    if (typeof window === 'undefined') return null;

    try {
      const data = window.sessionStorage.getItem('join-data');
      if (!data) return null;

      const parsed: JoinData = JSON.parse(data);

      // Check if data is recent and for the correct room
      if (parsed.roomId === roomId && Date.now() - parsed.timestamp < SESSION_TIMEOUT) {
        return parsed;
      }

      // Clean up old data
      window.sessionStorage.removeItem('join-data');
      return null;
    } catch (error) {
      console.error('Error parsing join data:', error);
      window.sessionStorage.removeItem('join-data');
      return null;
    }
  },

  // Clear room creator data
  clearRoomCreator() {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem('room-creator');
  },

  // Clear join data
  clearJoinData() {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem('join-data');
  },

  // Clear all room-related data
  clearAll() {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem('room-creator');
    window.sessionStorage.removeItem('join-data');
  },
};

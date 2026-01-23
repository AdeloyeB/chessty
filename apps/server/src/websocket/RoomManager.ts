/**
 * Manages game rooms (player membership) and spectator rooms.
 */
export class RoomManager {
  // Map of gameId -> Set of player userIds
  private gameRooms = new Map<string, Set<string>>();
  // Map of gameId -> Set of spectator userIds
  private spectatorRooms = new Map<string, Set<string>>();

  // --- Player Room Methods ---

  addPlayer(gameId: string, userId: string): void {
    if (!this.gameRooms.has(gameId)) {
      this.gameRooms.set(gameId, new Set());
    }
    this.gameRooms.get(gameId)!.add(userId);
  }

  removePlayer(gameId: string, userId: string): void {
    const room = this.gameRooms.get(gameId);
    if (room) {
      room.delete(userId);
      if (room.size === 0) {
        this.gameRooms.delete(gameId);
      }
    }
  }

  getPlayers(gameId: string): Set<string> | undefined {
    return this.gameRooms.get(gameId);
  }

  getPlayerCount(gameId: string): number {
    return this.gameRooms.get(gameId)?.size ?? 0;
  }

  hasRoom(gameId: string): boolean {
    return this.gameRooms.has(gameId);
  }

  deleteRoom(gameId: string): void {
    this.gameRooms.delete(gameId);
  }

  getActiveGameCount(): number {
    return this.gameRooms.size;
  }

  // --- Spectator Room Methods ---

  addSpectator(gameId: string, userId: string): void {
    if (!this.spectatorRooms.has(gameId)) {
      this.spectatorRooms.set(gameId, new Set());
    }
    this.spectatorRooms.get(gameId)!.add(userId);
  }

  removeSpectator(gameId: string, userId: string): void {
    const room = this.spectatorRooms.get(gameId);
    if (room) {
      room.delete(userId);
      if (room.size === 0) {
        this.spectatorRooms.delete(gameId);
      }
    }
  }

  getSpectators(gameId: string): Set<string> | undefined {
    return this.spectatorRooms.get(gameId);
  }

  getSpectatorCount(gameId: string): number {
    return this.spectatorRooms.get(gameId)?.size ?? 0;
  }

  getTotalSpectatorCount(): number {
    let total = 0;
    for (const room of this.spectatorRooms.values()) {
      total += room.size;
    }
    return total;
  }

  deleteSpectatorRoom(gameId: string): void {
    this.spectatorRooms.delete(gameId);
  }
}

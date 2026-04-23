import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';
import { RoomsService } from '../rooms/rooms.service.js';
import type { WsResponse, RoomStatePayload, GameMode } from '../types/events.js';
import type { Server, Socket } from 'socket.io';

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly roomsService: RoomsService,
  ) {}

  async joinRoom(
    client: Socket,
    code: string,
  ): Promise<WsResponse<RoomStatePayload & { roomId: string }>> {
    const room = await this.roomsService.findByCode(code);

    if (!room) {
      return { success: false, error: 'Sala no encontrada' };
    }

    if (room.status !== 'waiting') {
      return { success: false, error: 'La sala ya no acepta jugadores' };
    }

    const data = client.data as { userId?: string; username?: string };
    const userId = data.userId;
    const username = data.username ?? 'Jugador';

    if (!userId) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    const players = await this.roomsService.getPlayers(room.id);

    if (players.length >= room.maxPlayers) {
      return { success: false, error: 'La sala está llena' };
    }

    await this.roomsService.addPlayer(room.id, userId, username);
    await this.redis.set(`user:${userId}:socket`, client.id, 3600);

    // Refrescar lista actualizada con el jugador recién añadido
    const updatedPlayers = await this.roomsService.getPlayers(room.id);

    return {
      success: true,
      data: {
        roomId: room.id,
        players: updatedPlayers,
        mode: room.mode as GameMode,
        status: room.status,
      },
    };
  }

  recordInterest(fromUserId: string, toUserId: string, roomId: string): void {
    // Regla 1 + 4: guardar en Redis, revelar solo al final si hay match mutuo
    const key = `interest:${roomId}:${fromUserId}`;
    this.redis.hset(key, toUserId, '1').catch((err: unknown) => {
      this.logger.error('Failed to record interest', err);
    });
  }

  async resolveMatches(roomId: string, playerIds: string[]): Promise<{ fromId: string; toId: string }[]> {
    const matches: { fromId: string; toId: string }[] = [];
    for (const fromId of playerIds) {
      const key = `interest:${roomId}:${fromId}`;
      const interests = await this.redis.hgetall(key);
      for (const toId of Object.keys(interests)) {
        const reverseKey = `interest:${roomId}:${toId}`;
        const reverseInterest = await this.redis.hget(reverseKey, fromId);
        if (reverseInterest && fromId < toId) {
          // fromId < toId evita duplicados
          matches.push({ fromId, toId });
        }
      }
    }
    return matches;
  }

  async endRoom(roomId: string, server: Server): Promise<void> {
    const players = await this.roomsService.getPlayers(roomId);
    const playerIds = players.map((p) => p.id);
    const matches = await this.resolveMatches(roomId, playerIds);

    for (const match of matches) {
      const fromSocketId = await this.redis.get(`user:${match.fromId}:socket`);
      const toSocketId = await this.redis.get(`user:${match.toId}:socket`);

      // Emitir solo a los sockets involucrados (nunca broadcast)
      if (fromSocketId) {
        server.to(fromSocketId).emit('room:match_reveal' as never, {
          matchedUserId: match.toId,
        });
      }
      if (toSocketId) {
        server.to(toSocketId).emit('room:match_reveal' as never, {
          matchedUserId: match.fromId,
        });
      }
    }

    await this.roomsService.setRoomActive(roomId);
    this.logger.log(`Room ${roomId} ended — ${matches.length} matches revealed`);
  }
}

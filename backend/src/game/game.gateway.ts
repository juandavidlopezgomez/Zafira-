import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { UseGuards, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service.js';
import { BottleService } from './modes/bottle.service.js';
import { RoomsService } from '../rooms/rooms.service.js';
import { RedisService } from '../redis/redis.service.js';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  WsResponse,
  RoomJoinPayload,
  RoomStatePayload,
} from '../types/events.js';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

@UseGuards(WsJwtGuard)
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: TypedServer;

  private readonly logger = new Logger(GameGateway.name);

  constructor(
    private readonly gameService: GameService,
    private readonly bottleService: BottleService,
    private readonly roomsService: RoomsService,
    private readonly redis: RedisService,
  ) {}

  handleConnection(client: TypedSocket): void {
    const userId = client.data.userId;
    this.logger.log(`Client connected: ${client.id} (user: ${userId ?? 'unauthenticated'})`);

    if (userId) {
      this.redis.set(`user:${userId}:socket`, client.id, 3600).catch((err: unknown) => {
        this.logger.error('Failed to store socket mapping', err);
      });
    }
  }

  handleDisconnect(client: TypedSocket): void {
    const { userId, roomId } = client.data;
    this.logger.log(`Client disconnected: ${client.id} (user: ${userId ?? 'anon'})`);
    if (roomId) {
      client.to(roomId).emit('room:player_left', { userId: userId! });
    }
  }

  @SubscribeMessage('room:join')
  async handleRoomJoin(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() payload: RoomJoinPayload,
  ): Promise<WsResponse<RoomStatePayload>> {
    const result = await this.gameService.joinRoom(client, payload.code);
    if (!result.success) return result;

    await client.join(result.data!.roomId);
    client.data.roomId = result.data!.roomId;
    client.to(result.data!.roomId).emit('room:player_joined', {
      userId: client.data.userId!,
      username: client.data.username!,
    });
    return result;
  }

  @SubscribeMessage('room:leave')
  async handleRoomLeave(
    @ConnectedSocket() client: TypedSocket,
  ): Promise<WsResponse> {
    const { roomId, userId } = client.data;
    if (!roomId) return { success: true };

    await client.leave(roomId);
    client.to(roomId).emit('room:player_left', { userId: userId! });
    client.data.roomId = undefined;
    return { success: true };
  }

  @SubscribeMessage('bottle:spin')
  async handleBottleSpin(
    @ConnectedSocket() client: TypedSocket,
  ): Promise<WsResponse> {
    const { roomId, userId } = client.data;
    if (!roomId || !userId) return { success: false, error: 'No estás en ninguna sala' };

    try {
      const players = await this.roomsService.getPlayers(roomId);
      const result = await this.bottleService.spin(roomId, userId, players);

      this.server.to(roomId).emit('bottle:spin', {
        targetId: result.to,
        targetName: result.toName,
      });

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al girar la botella';
      return { success: false, error: msg };
    }
  }

  @SubscribeMessage('game:mark_interest')
  handleMarkInterest(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() payload: { targetId: string },
  ): void {
    // Regla 1: nunca emitir señales de interés durante la partida
    this.gameService.recordInterest(client.data.userId!, payload.targetId, client.data.roomId!);
    // NO se emite nada al socket — se guarda en Redis hasta fin de sesión
  }

  @SubscribeMessage('game:end')
  async handleGameEnd(
    @ConnectedSocket() client: TypedSocket,
  ): Promise<WsResponse> {
    const { roomId } = client.data;
    if (!roomId) return { success: false, error: 'No estás en ninguna sala' };

    try {
      await this.gameService.endRoom(roomId, this.server as unknown as Server);
      this.server.to(roomId).emit('game:finished', { matches: [] });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al finalizar la partida';
      return { success: false, error: msg };
    }
  }
}

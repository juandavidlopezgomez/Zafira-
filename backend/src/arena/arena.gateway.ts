import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  ConnectedSocket, MessageBody, WsException,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ArenaService, type ArenaFeature } from './arena.service.js';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard.js';

@UseGuards(WsJwtGuard)
@WebSocketGateway({
  namespace: '/arena',
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
})
export class ArenaGateway {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ArenaGateway.name);

  constructor(private readonly arenaService: ArenaService) {}

  @SubscribeMessage('arena:start_feature')
  async handleStartFeature(
    @ConnectedSocket() client: Socket & { data: { userId: string; isPremium: boolean; roomId: string } },
    @MessageBody() payload: { feature: ArenaFeature; playerIds: string[] },
  ): Promise<{ success: boolean; stadiumId?: string; error?: string }> {
    try {
      const stadium = await this.arenaService.startFeature(
        client.data.roomId,
        payload.feature,
        payload.playerIds,
        client.data.isPremium,
      );

      this.server.to(client.data.roomId).emit('arena:feature_started', {
        feature: payload.feature,
        stadiumId: stadium.id,
      });

      return { success: true, stadiumId: stadium.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error iniciando feature';
      return { success: false, error: msg };
    }
  }

  @SubscribeMessage('arena:vote')
  async handleVote(
    @ConnectedSocket() client: Socket & { data: { userId: string; roomId: string } },
    @MessageBody() payload: { stadiumId: string; targetId: string; voteType: string },
  ): Promise<void> {
    const { count } = await this.arenaService.vote(
      payload.stadiumId,
      client.data.userId,
      payload.targetId,
      payload.voteType,
    );

    this.server.to(client.data.roomId).emit('arena:vote_counted', {
      stadiumId: payload.stadiumId,
      targetId: payload.targetId,
      count,
    });
  }

  @SubscribeMessage('arena:ruleta_spin')
  async handleRuletaSpin(
    @ConnectedSocket() client: Socket & { data: { userId: string; roomId: string } },
    @MessageBody() payload: { stadiumId: string; targetUserId: string },
  ): Promise<void> {
    const result = this.arenaService.spinRuleta();

    if (result.llamasDelta !== 0) {
      // Notificar cross-módulo para procesar LLAMAS
      client.emit('arena:ruleta_result', {
        ...result,
        targetUserId: payload.targetUserId,
      });
    }

    this.server.to(client.data.roomId).emit('arena:result', {
      stadiumId: payload.stadiumId,
      payload: { ...result, targetUserId: payload.targetUserId },
    });
  }

  @SubscribeMessage('arena:ship')
  async handleShip(
    @ConnectedSocket() client: Socket & { data: { userId: string; roomId: string } },
    @MessageBody() payload: { stadiumId: string; person1: string; person2: string },
  ): Promise<void> {
    await this.arenaService.shipProposal(
      payload.stadiumId,
      client.data.userId,
      payload.person1,
      payload.person2,
    );

    this.server.to(client.data.roomId).emit('arena:vote_counted', {
      stadiumId: payload.stadiumId,
      targetId: `${payload.person1}:${payload.person2}`,
      count: 1,
    });
  }

  @SubscribeMessage('arena:end_feature')
  async handleEndFeature(
    @ConnectedSocket() client: Socket & { data: { roomId: string } },
    @MessageBody() payload: { stadiumId: string },
  ): Promise<void> {
    const results = await this.arenaService.getResults(payload.stadiumId);
    await this.arenaService.endFeature(payload.stadiumId);

    this.server.to(client.data.roomId).emit('arena:result', {
      stadiumId: payload.stadiumId,
      winnerId: results.winner,
      payload: results,
    });
  }
}

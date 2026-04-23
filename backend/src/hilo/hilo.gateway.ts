import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { HiloService } from './hilo.service.js';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard.js';
import type { TensionLevel } from '../types/events.js';

interface HiloSocketData {
  userId?: string;
  aliasId?: string;
  isPremium?: boolean;
  hiloId?: string;
  roomId?: string;
}

type HiloSocket = Socket & { data: HiloSocketData };

// Regla: namespace /hilo separado del gateway principal (Tarea 4.11)
@UseGuards(WsJwtGuard)
@WebSocketGateway({
  namespace: '/hilo',
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
})
export class HiloGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(HiloGateway.name);

  constructor(private readonly hiloService: HiloService) {}

  handleConnection(client: HiloSocket): void {
    // userId ya viene seteado por WsJwtGuard en client.data.userId
    const userId = client.data.userId;
    this.logger.log(`Hilo client connected: ${client.id} (user: ${userId ?? 'unauthenticated'})`);
    // En modo anónimo, generar aliasId (Regla 8)
    client.data.aliasId = `anon_${Math.random().toString(36).substring(2, 8)}`;
  }

  @SubscribeMessage('hilo:join')
  async handleJoin(
    @ConnectedSocket() client: HiloSocket,
    @MessageBody() payload: { hiloId: string; roomId: string; userId?: string },
  ): Promise<{ success: boolean }> {
    await client.join(payload.roomId);
    client.data.hiloId = payload.hiloId;
    client.data.roomId = payload.roomId;
    client.data.userId = payload.userId;

    const tensionLevel = await this.hiloService.getTensionLevel(payload.roomId);
    client.emit('hilo:tension_changed', {
      hiloId: payload.hiloId,
      level: tensionLevel as TensionLevel,
    });

    return { success: true };
  }

  @SubscribeMessage('hilo:send_message')
  async handleMessage(
    @ConnectedSocket() client: HiloSocket,
    @MessageBody() payload: { content: string; isAnonymous?: boolean },
  ): Promise<{ success: boolean; error?: string }> {
    if (!client.data.hiloId || !client.data.roomId) {
      throw new WsException('No estás en ningún Hilo');
    }

    // Nivel 5 requiere Premium (Regla: Tarea 4.11)
    const currentLevel = await this.hiloService.getTensionLevel(client.data.roomId);
    if (currentLevel >= 5 && !client.data.isPremium) {
      throw new WsException('El Hilo Peligroso requiere cuenta Premium');
    }

    try {
      const { message, tensionLevel, newTension } = await this.hiloService.sendMessage({
        hiloId: client.data.hiloId,
        roomId: client.data.roomId,
        userId: client.data.userId,
        aliasId: client.data.aliasId,
        content: payload.content,
        isAnonymous: payload.isAnonymous ?? false,
      });

      // Broadcast al room del Hilo
      this.server.to(client.data.roomId).emit('hilo:message', {
        id: message.id,
        hiloId: client.data.hiloId,
        // Regla 8: nunca emitir userId en modo anónimo
        userId: payload.isAnonymous ? undefined : client.data.userId,
        aliasId: payload.isAnonymous ? client.data.aliasId : undefined,
        content: payload.content,
        tension: tensionLevel as TensionLevel,
        createdAt: message.createdAt.toISOString(),
      });

      // Broadcast cambio de nivel si subió
      this.server.to(client.data.roomId).emit('hilo:tension_changed', {
        hiloId: client.data.hiloId,
        level: tensionLevel as TensionLevel,
      });

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al enviar mensaje';
      return { success: false, error: msg };
    }
  }

  @SubscribeMessage('hilo:react')
  async handleReaction(
    @ConnectedSocket() client: HiloSocket,
    @MessageBody() payload: { messageId: string; reaction: string },
  ): Promise<void> {
    if (!client.data.roomId || !client.data.hiloId) return;

    const { tensionLevel } = await this.hiloService.addReaction(
      client.data.hiloId,
      client.data.roomId,
      payload.messageId,
      client.data.userId ?? client.data.aliasId ?? 'anon',
      payload.reaction,
    );

    this.server.to(client.data.roomId).emit('hilo:reaction', {
      messageId: payload.messageId,
      reaction: payload.reaction,
    });

    this.server.to(client.data.roomId).emit('hilo:tension_changed', {
      hiloId: client.data.hiloId,
      level: tensionLevel as TensionLevel,
    });
  }

  @SubscribeMessage('hilo:confession')
  async handleConfession(
    @ConnectedSocket() client: HiloSocket,
    @MessageBody() payload: { content: string },
  ): Promise<{ success: boolean }> {
    if (!client.data.hiloId || !client.data.roomId) return { success: false };

    // Confesiones requieren nivel 4+
    const level = await this.hiloService.getTensionLevel(client.data.roomId);
    if (level < 4) throw new WsException('Las confesiones requieren nivel de tensión 4+');

    await this.hiloService.addConfession(
      client.data.hiloId,
      client.data.roomId,
      client.data.aliasId!,
      payload.content,
    );

    return { success: true };
  }
}

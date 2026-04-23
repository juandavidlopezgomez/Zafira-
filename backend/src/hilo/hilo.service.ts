import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisService } from '../redis/redis.service';
import { AiService } from '../ai/ai.service';
import { Hilo, HiloMessage, HiloTensionHistory, HiloConfession } from './hilo.module';

// Puntos de tensión por acción (Tarea 4.13)
const TENSION_POINTS = {
  message: 1,
  reaction: 2,
  confession: 5,
  gif: 1,
  skip: -1,
} as const;

// Umbrales de nivel de tensión
const TENSION_THRESHOLDS = [0, 20, 40, 60, 80];

@Injectable()
export class HiloService {
  private readonly logger = new Logger(HiloService.name);

  constructor(
    @InjectRepository(Hilo) private readonly hiloRepo: Repository<Hilo>,
    @InjectRepository(HiloMessage) private readonly msgRepo: Repository<HiloMessage>,
    @InjectRepository(HiloTensionHistory) private readonly tensionHistRepo: Repository<HiloTensionHistory>,
    @InjectRepository(HiloConfession) private readonly confessionRepo: Repository<HiloConfession>,
    private readonly redis: RedisService,
    private readonly ai: AiService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createHilo(roomId: string, type: string, isPremium: boolean): Promise<Hilo> {
    const hilo = this.hiloRepo.create({ roomId, type, tension: 1, isPremium });
    return this.hiloRepo.save(hilo);
  }

  async sendMessage(params: {
    hiloId: string;
    roomId: string;
    userId?: string;
    aliasId?: string;
    content: string;
    isAnonymous: boolean;
  }): Promise<{ message: HiloMessage; tensionLevel: number; newTension: number }> {

    // Regla 11: Moderación OBLIGATORIA antes de broadcast
    const modResult = await this.ai.moderate(params.content);
    if (modResult.flagged) {
      throw new Error('Mensaje no permitido por moderación');
    }

    // Guardar mensaje
    const message = this.msgRepo.create({
      hiloId: params.hiloId,
      userId: params.isAnonymous ? undefined : params.userId,
      aliasId: params.isAnonymous ? params.aliasId : undefined, // Regla 8
      content: params.content,
      moderated: true,
    });
    await this.msgRepo.save(message);

    // Actualizar tensión en Redis (Regla 6)
    const newTension = await this.updateTension(params.roomId, TENSION_POINTS.message);
    const tensionLevel = this.calculateLevel(newTension);

    // Evento especial si tensión máxima
    if (newTension >= 100) {
      this.eventEmitter.emit('hilo.max_tension', { roomId: params.roomId });
    }

    // Crédito LLAMAS por reacción
    if (params.userId) {
      this.eventEmitter.emit('llamas.credit', {
        userId: params.userId,
        amount: 5,
        reason: 'hilo_message',
      });
    }

    return { message, tensionLevel, newTension };
  }

  async addReaction(
    hiloId: string,
    roomId: string,
    messageId: string,
    userId: string,
    reaction: string,
  ): Promise<{ tensionLevel: number }> {
    await this.msgRepo.update(messageId, { reaction });
    const newTension = await this.updateTension(roomId, TENSION_POINTS.reaction);
    return { tensionLevel: this.calculateLevel(newTension) };
  }

  async addConfession(
    hiloId: string,
    roomId: string,
    aliasId: string,
    content: string,
  ): Promise<HiloConfession> {
    const modResult = await this.ai.moderate(content);
    if (modResult.flagged) throw new Error('Confesión no permitida');

    const confession = this.confessionRepo.create({ hiloId, aliasId, content });
    await this.confessionRepo.save(confession);
    await this.updateTension(roomId, TENSION_POINTS.confession);
    return confession;
  }

  async getTensionLevel(roomId: string): Promise<number> {
    const raw = await this.redis.get(`hilo:${roomId}:tension`);
    return this.calculateLevel(parseInt(raw ?? '0'));
  }

  private async updateTension(roomId: string, delta: number): Promise<number> {
    const key = `hilo:${roomId}:tension`;
    const client = this.redis.getClient();

    let current = parseInt((await this.redis.get(key)) ?? '0');
    current = Math.max(0, Math.min(100, current + delta));
    await this.redis.set(key, current.toString(), 86400);
    return current;
  }

  calculateLevel(tension: number): number {
    if (tension < TENSION_THRESHOLDS[1]) return 1;
    if (tension < TENSION_THRESHOLDS[2]) return 2;
    if (tension < TENSION_THRESHOLDS[3]) return 3;
    if (tension < TENSION_THRESHOLDS[4]) return 4;
    return 5;
  }

  // Regla 6: Flush a BD cada 5 minutos
  @Cron(CronExpression.EVERY_5_MINUTES)
  async flushTensionToDB(): Promise<void> {
    this.logger.log('Flushing hilo tension to DB...');
    // Obtener todos los hilos activos (últimas 24h)
    const activeHilos = await this.hiloRepo.find({
      where: {},
      order: { createdAt: 'DESC' },
      take: 100,
    });

    for (const hilo of activeHilos) {
      const raw = await this.redis.get(`hilo:${hilo.roomId}:tension`);
      if (!raw) continue;

      const tension = parseInt(raw);
      const hist = this.tensionHistRepo.create({ hiloId: hilo.id, tension });
      await this.tensionHistRepo.save(hist).catch(() => null);
    }
  }
}

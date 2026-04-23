import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { RedisService } from '../redis/redis.service';
import { ArenaStadium, ArenaVote } from './arena.module';

// Regla 7: mínimo 5 participantes para iniciar Arena
const MIN_PARTICIPANTS = 5;

export type ArenaFeature =
  | 'el_estadio' | 'silla_caliente' | 'sobre_rojo' | 'corona_semanal'
  | 'quien_en_tu_curso' | 'termometro_colegio' | 'momento_epico'
  | 'ruleta_maldita' | 'el_shipper';

const PREMIUM_FEATURES: ArenaFeature[] = ['sobre_rojo'];

@Injectable()
export class ArenaService {
  private readonly logger = new Logger(ArenaService.name);

  constructor(
    @InjectRepository(ArenaStadium) private readonly stadiumRepo: Repository<ArenaStadium>,
    @InjectRepository(ArenaVote) private readonly voteRepo: Repository<ArenaVote>,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async startFeature(
    roomId: string,
    feature: ArenaFeature,
    playerIds: string[],
    isPremium: boolean,
  ): Promise<ArenaStadium> {
    // Regla 7: validar mínimo 5
    if (playerIds.length < MIN_PARTICIPANTS) {
      throw new BadRequestException(`Arena requiere mínimo ${MIN_PARTICIPANTS} participantes`);
    }

    // Validar Premium para features exclusivas
    if (PREMIUM_FEATURES.includes(feature) && !isPremium) {
      throw new BadRequestException(`${feature} requiere cuenta Premium`);
    }

    const stadium = this.stadiumRepo.create({
      roomId,
      feature,
      status: 'active',
      startedAt: new Date(),
    });
    await this.stadiumRepo.save(stadium);

    // Estado en Redis
    await this.redis.set(
      `arena:${stadium.id}:state`,
      JSON.stringify({ feature, playerIds, votes: {}, status: 'active' }),
      3600,
    );

    return stadium;
  }

  async vote(
    stadiumId: string,
    voterId: string,
    targetId: string | null,
    voteType: string,
  ): Promise<{ count: number }> {
    // Upsert voto (UNIQUE constraint en BD)
    const existing = await this.voteRepo.findOne({
      where: { stadiumId, voterId, voteType },
    });

    if (existing) {
      await this.voteRepo.update(existing.id, { targetId: targetId ?? undefined });
    } else {
      const vote = this.voteRepo.create({ stadiumId, voterId, targetId: targetId ?? undefined, voteType });
      await this.voteRepo.save(vote);
    }

    const count = await this.voteRepo.count({ where: { stadiumId, voteType } });
    return { count };
  }

  async getResults(stadiumId: string): Promise<{
    distribution: Record<string, number>;
    winner?: string;
  }> {
    const votes = await this.voteRepo.find({ where: { stadiumId } });
    const distribution: Record<string, number> = {};

    for (const v of votes) {
      if (v.targetId) {
        distribution[v.targetId] = (distribution[v.targetId] ?? 0) + 1;
      }
    }

    const winner = Object.entries(distribution).sort((a, b) => b[1] - a[1])[0]?.[0];
    return { distribution, winner };
  }

  async endFeature(stadiumId: string): Promise<void> {
    await this.stadiumRepo.update(stadiumId, { status: 'finished', endedAt: new Date() });
    await this.redis.del(`arena:${stadiumId}:state`);
  }

  // ─── Ruleta Maldita ───────────────────────────────────────
  spinRuleta(): { label: string; effect: string; llamasDelta: number } {
    const options = [
      { label: 'Pierde 20 LLAMAS', effect: 'lose_llamas', llamasDelta: -20 },
      { label: 'El grupo te hace una pregunta', effect: 'group_question', llamasDelta: 0 },
      { label: 'Duplica tus puntos', effect: 'double_points', llamasDelta: 0 },
      { label: 'Reto especial', effect: 'special_challenge', llamasDelta: 0 },
      { label: 'Gana 15 LLAMAS', effect: 'gain_llamas', llamasDelta: 15 },
    ];
    return options[Math.floor(Math.random() * options.length)];
  }

  // ─── El Shipper ───────────────────────────────────────────
  async shipProposal(
    stadiumId: string,
    proposerId: string,
    person1: string,
    person2: string,
  ): Promise<void> {
    const shipId = [person1, person2].sort().join(':');
    await this.vote(stadiumId, proposerId, shipId, 'ship');
  }

  async getTopShip(stadiumId: string): Promise<{ person1: string; person2: string; votes: number } | null> {
    const { distribution } = await this.getResults(stadiumId);
    const top = Object.entries(distribution).sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;

    const [person1, person2] = top[0].split(':');
    return { person1, person2, votes: top[1] };
  }

  // ─── Corona Semanal (Tarea 4.5) ──────────────────────────
  // Cron: todos los lunes a medianoche
  @Cron('0 0 * * 1')
  async assignWeeklyCrown(): Promise<void> {
    this.logger.log('Asignando coronas semanales...');
    try {
      // Necesita acceso al DB de charisma_events — usar EventEmitter cross-módulo
      this.eventEmitter.emit('arena.weekly_crown.compute');
    } catch (err) {
      this.logger.error('Error asignando corona semanal', err);
    }
  }

  @OnEvent('arena.weekly_crown.result')
  async onWeeklyCrownResult(top3: { userId: string; points: number }[]): Promise<void> {
    const bonuses = [1000, 500, 250];
    for (const [i, user] of top3.entries()) {
      const bonus = bonuses[i] ?? 0;
      this.eventEmitter.emit('llamas.credit', {
        userId: user.userId,
        amount: bonus,
        reason: 'weekly_crown',
      });
      this.eventEmitter.emit('badges.award', {
        userId: user.userId,
        badgeType: `crown_position_${i + 1}`,
      });
    }
  }
}

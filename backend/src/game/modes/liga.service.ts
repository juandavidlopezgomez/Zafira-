import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface LeagueRound {
  roundId: string;
  challengeText: string;
  timeoutSeconds: number;
  activePlayerId: string;
}

@Injectable()
export class LigaService {
  private readonly ROUND_TTL = 30; // 30 segundos por reto

  constructor(
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async nextRound(roomId: string, playerId: string): Promise<LeagueRound> {
    const roundId = crypto.randomUUID();

    const challenge = await new Promise<{ text: string }>((resolve) => {
      this.eventEmitter.emit('challenges.get', {
        type: 'dare',
        intensity: 2,
        tags: ['liga'],
        callback: (c: { text: string }) => resolve(c),
      });
    });

    const round: LeagueRound = {
      roundId,
      challengeText: challenge.text,
      timeoutSeconds: this.ROUND_TTL,
      activePlayerId: playerId,
    };

    await this.redis.set(
      `room:${roomId}:liga:round:${roundId}`,
      JSON.stringify({ ...round, votes: {}, startedAt: Date.now() }),
      this.ROUND_TTL + 10,
    );

    return round;
  }

  async submitResult(
    roomId: string,
    roundId: string,
    voterId: string,
    completed: boolean,
  ): Promise<{ scores: Record<string, number> }> {
    const raw = await this.redis.get(`room:${roomId}:liga:round:${roundId}`);
    if (!raw) throw new Error('Ronda expirada o no encontrada');

    const round = JSON.parse(raw) as {
      activePlayerId: string;
      votes: Record<string, boolean>;
    };

    round.votes[voterId] = completed;
    await this.redis.set(`room:${roomId}:liga:round:${roundId}`, JSON.stringify(round), this.ROUND_TTL);

    const votes = Object.values(round.votes);
    const majority = votes.filter(Boolean).length > votes.length / 2;

    const scoresKey = `room:${roomId}:liga:scores`;
    const raw2 = await this.redis.get(scoresKey);
    const scores: Record<string, number> = raw2 ? JSON.parse(raw2) : {};

    if (majority) {
      const currentScore = scores[round.activePlayerId] ?? 0;
      scores[round.activePlayerId] = currentScore + 1;

      // Bonus por racha ganadora
      const streakKey = `room:${roomId}:liga:streak:${round.activePlayerId}`;
      const streak = await this.redis.incr(streakKey);
      await this.redis.expire(streakKey, 7200);
      if (streak >= 3) {
        scores[round.activePlayerId] += 1; // bonus racha
        this.eventEmitter.emit('llamas.credit', {
          userId: round.activePlayerId,
          amount: 15,
          reason: 'liga_streak_bonus',
        });
      }

      await this.redis.set(scoresKey, JSON.stringify(scores), 7200);
    } else {
      await this.redis.del(`room:${roomId}:liga:streak:${round.activePlayerId}`);
    }

    return { scores };
  }

  async getFinalStandings(roomId: string): Promise<{ userId: string; score: number }[]> {
    const raw = await this.redis.get(`room:${roomId}:liga:scores`);
    const scores: Record<string, number> = raw ? JSON.parse(raw) : {};

    return Object.entries(scores)
      .map(([userId, score]) => ({ userId, score }))
      .sort((a, b) => b.score - a.score);
  }
}

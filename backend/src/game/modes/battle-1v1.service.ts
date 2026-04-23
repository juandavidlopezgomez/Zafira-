import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface BattleRound {
  roundId: string;
  player1: string;
  player2: string;
  questionText: string;
  roundNumber: number;
}

export interface BattleResult {
  roundId: string;
  winnerId: string;
  votes: Record<string, number>;
  scores: Record<string, number>;
}

@Injectable()
export class Battle1v1Service {
  constructor(
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async startBattle(
    roomId: string,
    player1: string,
    player2: string,
    roundNumber: number = 1,
  ): Promise<BattleRound> {
    const roundId = crypto.randomUUID();

    const question = await new Promise<{ text: string }>((resolve) => {
      this.eventEmitter.emit('challenges.get', {
        type: 'battle',
        intensity: 3,
        tags: ['1v1'],
        callback: (c: { text: string }) => resolve(c),
      });
    });

    const round: BattleRound = {
      roundId,
      player1,
      player2,
      questionText: question.text,
      roundNumber,
    };

    await this.redis.set(
      `room:${roomId}:battle:${roundId}`,
      JSON.stringify({ ...round, votes: {}, status: 'voting' }),
      120,
    );

    return round;
  }

  async vote(
    roomId: string,
    roundId: string,
    voterId: string,
    votedFor: string,
  ): Promise<BattleResult | null> {
    const raw = await this.redis.get(`room:${roomId}:battle:${roundId}`);
    if (!raw) throw new Error('Ronda no encontrada');

    const round = JSON.parse(raw) as {
      player1: string;
      player2: string;
      votes: Record<string, string>;
    };

    round.votes[voterId] = votedFor;
    await this.redis.set(`room:${roomId}:battle:${roundId}`, JSON.stringify(round), 120);

    // Acumular votos
    const allVotes = Object.values(round.votes);
    const p1Votes = allVotes.filter((v) => v === round.player1).length;
    const p2Votes = allVotes.filter((v) => v === round.player2).length;

    // Resultado solo si suficientes votos (se puede ajustar umbral)
    const votes = { [round.player1]: p1Votes, [round.player2]: p2Votes };
    const winnerId = p1Votes >= p2Votes ? round.player1 : round.player2;

    // Actualizar score acumulado
    const scoreKey = `room:${roomId}:battle_scores`;
    const scoresRaw = await this.redis.get(scoreKey);
    const scores: Record<string, number> = scoresRaw ? JSON.parse(scoresRaw) : {};
    scores[round.player1] = (scores[round.player1] ?? 0) + (p1Votes > p2Votes ? 1 : 0);
    scores[round.player2] = (scores[round.player2] ?? 0) + (p2Votes > p1Votes ? 1 : 0);
    await this.redis.set(scoreKey, JSON.stringify(scores), 7200);

    return { roundId, winnerId, votes, scores };
  }
}

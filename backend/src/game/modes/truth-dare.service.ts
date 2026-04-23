import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface TruthDareRound {
  roundId: string;
  playerId: string;
  choice: 'truth' | 'dare';
  challengeText: string;
  canSkip: boolean;
}

@Injectable()
export class TruthDareService {
  constructor(
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async startRound(
    roomId: string,
    playerId: string,
    choice: 'truth' | 'dare',
  ): Promise<TruthDareRound> {
    const roundId = crypto.randomUUID();

    // Verificar si ya usó el skip esta sesión
    const skipUsed = await this.redis.get(`room:${roomId}:skip:${playerId}`);

    // Solicitar reto al ChallengesModule via evento (Regla 12: cross-módulo via eventos)
    const challenge = await new Promise<{ text: string }>((resolve) => {
      this.eventEmitter.emit('challenges.get', {
        type: choice,
        intensity: 2,
        tags: [],
        callback: (c: { text: string }) => resolve(c),
      });
    });

    const round: TruthDareRound = {
      roundId,
      playerId,
      choice,
      challengeText: challenge.text,
      canSkip: !skipUsed,
    };

    await this.redis.set(
      `room:${roomId}:round:${roundId}`,
      JSON.stringify({ ...round, votes: {}, status: 'active' }),
      300,
    );

    return round;
  }

  async skip(roomId: string, playerId: string, roundId: string): Promise<void> {
    const skipUsed = await this.redis.get(`room:${roomId}:skip:${playerId}`);
    if (skipUsed) throw new Error('Ya usaste tu skip esta partida');

    await this.redis.set(`room:${roomId}:skip:${playerId}`, '1', 7200);
    await this.redis.del(`room:${roomId}:round:${roundId}`);
  }

  async vote(
    roomId: string,
    roundId: string,
    voterId: string,
    completed: boolean,
  ): Promise<{ totalVotes: number; completedVotes: number }> {
    const raw = await this.redis.get(`room:${roomId}:round:${roundId}`);
    if (!raw) throw new Error('Ronda no encontrada');

    const round = JSON.parse(raw) as { votes: Record<string, boolean> };
    round.votes[voterId] = completed;

    await this.redis.set(
      `room:${roomId}:round:${roundId}`,
      JSON.stringify(round),
      300,
    );

    const votes = Object.values(round.votes);
    return {
      totalVotes: votes.length,
      completedVotes: votes.filter(Boolean).length,
    };
  }
}

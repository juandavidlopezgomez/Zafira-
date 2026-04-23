import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class TodoNadaService {
  private readonly MAX_BET = 50;
  private readonly MIN_BET = 1;

  constructor(
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async placeBet(
    roomId: string,
    playerId: string,
    amount: number,
  ): Promise<{ roundId: string; challengeText: string }> {
    if (amount < this.MIN_BET || amount > this.MAX_BET) {
      throw new Error(`La apuesta debe ser entre ${this.MIN_BET} y ${this.MAX_BET} LLAMAS`);
    }

    // Descontar LLAMAS inmediatamente via evento (validar balance en LlamasService)
    await new Promise<void>((resolve, reject) => {
      this.eventEmitter.emit('llamas.debit', {
        userId: playerId,
        amount,
        reason: 'todo_nada_bet',
        callback: (err?: Error) => (err ? reject(err) : resolve()),
      });
    });

    const roundId = crypto.randomUUID();

    const challenge = await new Promise<{ text: string }>((resolve) => {
      this.eventEmitter.emit('challenges.get', {
        type: 'dare',
        intensity: 3,
        tags: ['todo-nada'],
        callback: (c: { text: string }) => resolve(c),
      });
    });

    await this.redis.set(
      `room:${roomId}:todonada:${roundId}`,
      JSON.stringify({ playerId, amount, challengeText: challenge.text, votes: {}, status: 'active' }),
      300,
    );

    return { roundId, challengeText: challenge.text };
  }

  async vote(roomId: string, roundId: string, voterId: string, completed: boolean): Promise<void> {
    const raw = await this.redis.get(`room:${roomId}:todonada:${roundId}`);
    if (!raw) throw new Error('Ronda no encontrada');
    const round = JSON.parse(raw) as { votes: Record<string, boolean> };
    round.votes[voterId] = completed;
    await this.redis.set(`room:${roomId}:todonada:${roundId}`, JSON.stringify(round), 300);
  }

  async resolve(roomId: string, roundId: string): Promise<{ won: boolean; payout: number }> {
    const raw = await this.redis.get(`room:${roomId}:todonada:${roundId}`);
    if (!raw) throw new Error('Ronda no encontrada');

    const round = JSON.parse(raw) as {
      playerId: string;
      amount: number;
      votes: Record<string, boolean>;
    };

    const votes = Object.values(round.votes);
    const won = votes.filter(Boolean).length > votes.length / 2;
    const payout = won ? round.amount * 2 : 0;

    if (won) {
      this.eventEmitter.emit('llamas.credit', {
        userId: round.playerId,
        amount: payout,
        reason: 'todo_nada_win',
      });
    }

    return { won, payout };
  }
}

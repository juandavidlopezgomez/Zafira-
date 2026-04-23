import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class UltimoPieService {
  constructor(
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async startElimination(roomId: string, activePlayers: string[]): Promise<{ roundId: string }> {
    const roundId = crypto.randomUUID();
    await this.redis.set(
      `room:${roomId}:ultimo:${roundId}`,
      JSON.stringify({ activePlayers, votes: {}, status: 'voting' }),
      300,
    );
    return { roundId };
  }

  async vote(roomId: string, roundId: string, voterId: string, targetId: string): Promise<void> {
    const raw = await this.redis.get(`room:${roomId}:ultimo:${roundId}`);
    if (!raw) throw new Error('Ronda no encontrada');
    const round = JSON.parse(raw) as { votes: Record<string, string> };
    round.votes[voterId] = targetId;
    await this.redis.set(`room:${roomId}:ultimo:${roundId}`, JSON.stringify(round), 300);
  }

  async resolveElimination(
    roomId: string,
    roundId: string,
  ): Promise<{ eliminatedId: string; salvationChallenge: string; activePlayers: string[] }> {
    const raw = await this.redis.get(`room:${roomId}:ultimo:${roundId}`);
    if (!raw) throw new Error('Ronda no encontrada');

    const round = JSON.parse(raw) as { votes: Record<string, string>; activePlayers: string[] };

    const counts: Record<string, number> = {};
    for (const v of Object.values(round.votes)) {
      counts[v] = (counts[v] ?? 0) + 1;
    }

    const eliminatedId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

    const challenge = await new Promise<{ text: string }>((resolve) => {
      this.eventEmitter.emit('challenges.get', {
        type: 'dare',
        intensity: 4,
        tags: ['salvacion'],
        callback: (c: { text: string }) => resolve(c),
      });
    });

    const remaining = round.activePlayers.filter((id) => id !== eliminatedId);

    return {
      eliminatedId,
      salvationChallenge: challenge.text,
      activePlayers: remaining,
    };
  }

  async completeSalvation(roomId: string, eliminatedId: string, saved: boolean): Promise<void> {
    if (saved) {
      this.eventEmitter.emit('llamas.credit', {
        userId: eliminatedId,
        amount: 25,
        reason: 'ultimo_salvation',
      });
    }
  }
}

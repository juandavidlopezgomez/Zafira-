import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface TermometroQuestion {
  questionId: string;
  text: string;
}

export interface TermometroReveal {
  questionId: string;
  positions: Record<string, number>; // userId → valor 1-10
  average: number;
}

@Injectable()
export class TermometroService {
  constructor(
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async startQuestion(roomId: string): Promise<TermometroQuestion> {
    const questionId = crypto.randomUUID();

    const challenge = await new Promise<{ text: string }>((resolve) => {
      this.eventEmitter.emit('challenges.get', {
        type: 'termometro',
        intensity: 2,
        tags: ['self-position'],
        callback: (c: { text: string }) => resolve(c),
      });
    });

    await this.redis.set(
      `room:${roomId}:termometro:${questionId}`,
      JSON.stringify({ questionId, text: challenge.text, positions: {}, revealed: false }),
      300,
    );

    return { questionId, text: challenge.text };
  }

  async setPosition(roomId: string, questionId: string, userId: string, value: number): Promise<void> {
    if (value < 1 || value > 10) throw new Error('Valor debe estar entre 1 y 10');

    const raw = await this.redis.get(`room:${roomId}:termometro:${questionId}`);
    if (!raw) throw new Error('Pregunta no encontrada');

    const q = JSON.parse(raw) as { positions: Record<string, number> };
    q.positions[userId] = value;
    await this.redis.set(`room:${roomId}:termometro:${questionId}`, JSON.stringify(q), 300);
  }

  async reveal(roomId: string, questionId: string): Promise<TermometroReveal> {
    const raw = await this.redis.get(`room:${roomId}:termometro:${questionId}`);
    if (!raw) throw new Error('Pregunta no encontrada');

    const q = JSON.parse(raw) as { positions: Record<string, number> };
    const values = Object.values(q.positions);
    const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    return { questionId, positions: q.positions, average };
  }
}

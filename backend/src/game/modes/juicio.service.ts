import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface JuicioSession {
  sessionId: string;
  accusedId: string;
  question: string;
  accusedPrediction?: string;
}

export interface JuicioResult {
  sessionId: string;
  accusedId: string;
  votes: Record<string, string>; // voterId → opción
  distribution: Record<string, number>;
  accusedPredictionCorrect: boolean;
}

@Injectable()
export class JuicioService {
  constructor(
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async startJuicio(roomId: string, accusedId: string): Promise<JuicioSession> {
    const sessionId = crypto.randomUUID();

    const challenge = await new Promise<{ text: string }>((resolve) => {
      this.eventEmitter.emit('challenges.get', {
        type: 'juicio',
        intensity: 2,
        tags: ['self-reflection'],
        callback: (c: { text: string }) => resolve(c),
      });
    });

    const session: JuicioSession = { sessionId, accusedId, question: challenge.text };

    await this.redis.set(
      `room:${roomId}:juicio:${sessionId}`,
      JSON.stringify({ ...session, votes: {}, options: ['A', 'B', 'C'], status: 'pending_prediction' }),
      600,
    );

    return session;
  }

  async submitPrediction(roomId: string, sessionId: string, prediction: string): Promise<void> {
    const raw = await this.redis.get(`room:${roomId}:juicio:${sessionId}`);
    if (!raw) throw new Error('Sesión no encontrada');
    const session = JSON.parse(raw) as JuicioSession & { status: string };
    session.accusedPrediction = prediction;
    session.status = 'voting';
    await this.redis.set(`room:${roomId}:juicio:${sessionId}`, JSON.stringify(session), 600);
  }

  async vote(roomId: string, sessionId: string, voterId: string, option: string): Promise<void> {
    const raw = await this.redis.get(`room:${roomId}:juicio:${sessionId}`);
    if (!raw) throw new Error('Sesión no encontrada');
    const session = JSON.parse(raw) as { votes: Record<string, string> };
    session.votes[voterId] = option;
    await this.redis.set(`room:${roomId}:juicio:${sessionId}`, JSON.stringify(session), 600);
  }

  async reveal(roomId: string, sessionId: string): Promise<JuicioResult> {
    const raw = await this.redis.get(`room:${roomId}:juicio:${sessionId}`);
    if (!raw) throw new Error('Sesión no encontrada');
    const session = JSON.parse(raw) as JuicioSession & { votes: Record<string, string> };

    const distribution: Record<string, number> = {};
    for (const opt of Object.values(session.votes)) {
      distribution[opt] = (distribution[opt] ?? 0) + 1;
    }

    const topOption = Object.entries(distribution).sort((a, b) => b[1] - a[1])[0]?.[0];
    const accusedPredictionCorrect = session.accusedPrediction === topOption;

    if (accusedPredictionCorrect) {
      this.eventEmitter.emit('llamas.credit', {
        userId: session.accusedId,
        amount: 20,
        reason: 'juicio_prediction_correct',
      });
    }

    return {
      sessionId,
      accusedId: session.accusedId,
      votes: session.votes,
      distribution,
      accusedPredictionCorrect,
    };
  }
}

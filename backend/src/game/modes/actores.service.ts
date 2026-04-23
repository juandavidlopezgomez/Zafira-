import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

const ROLES = ['el seductor', 'el tímido', 'el directo', 'el misterioso', 'el gracioso', 'el romántico', 'el rebelde'];

export interface ActoresSession {
  sessionId: string;
  assignments: Record<string, string>; // userId → rol (secreto hasta el reveal)
}

@Injectable()
export class ActoresService {
  constructor(private readonly redis: RedisService) {}

  async assignRoles(roomId: string, playerIds: string[]): Promise<ActoresSession> {
    const sessionId = crypto.randomUUID();
    const shuffled = [...ROLES].sort(() => Math.random() - 0.5);

    const assignments: Record<string, string> = {};
    playerIds.forEach((id, i) => {
      assignments[id] = shuffled[i % shuffled.length];
    });

    await this.redis.set(
      `room:${roomId}:actores:${sessionId}`,
      JSON.stringify({ sessionId, assignments, votes: {}, guesses: {}, revealed: false }),
      600,
    );

    return { sessionId, assignments };
  }

  async getMyRole(roomId: string, sessionId: string, userId: string): Promise<string> {
    const raw = await this.redis.get(`room:${roomId}:actores:${sessionId}`);
    if (!raw) throw new Error('Sesión no encontrada');
    const session = JSON.parse(raw) as ActoresSession;
    return session.assignments[userId] ?? 'desconocido';
  }

  async voteBestActor(roomId: string, sessionId: string, voterId: string, targetId: string): Promise<void> {
    const raw = await this.redis.get(`room:${roomId}:actores:${sessionId}`);
    if (!raw) throw new Error('Sesión no encontrada');
    const session = JSON.parse(raw) as { votes: Record<string, string>; assignments: Record<string, string> };
    session.votes[voterId] = targetId;
    await this.redis.set(`room:${roomId}:actores:${sessionId}`, JSON.stringify(session), 600);
  }

  async guessRole(
    roomId: string,
    sessionId: string,
    guesserId: string,
    targetId: string,
    guessedRole: string,
  ): Promise<void> {
    const raw = await this.redis.get(`room:${roomId}:actores:${sessionId}`);
    if (!raw) throw new Error('Sesión no encontrada');
    const session = JSON.parse(raw) as { guesses: Record<string, Record<string, string>> };
    session.guesses[guesserId] = session.guesses[guesserId] ?? {};
    session.guesses[guesserId][targetId] = guessedRole;
    await this.redis.set(`room:${roomId}:actores:${sessionId}`, JSON.stringify(session), 600);
  }

  async reveal(roomId: string, sessionId: string): Promise<{
    assignments: Record<string, string>;
    bestActor: string;
    correctGuesses: Record<string, number>;
  }> {
    const raw = await this.redis.get(`room:${roomId}:actores:${sessionId}`);
    if (!raw) throw new Error('Sesión no encontrada');

    const session = JSON.parse(raw) as {
      assignments: Record<string, string>;
      votes: Record<string, string>;
      guesses: Record<string, Record<string, string>>;
    };

    // Mejor actor: más votado
    const voteCounts: Record<string, number> = {};
    for (const v of Object.values(session.votes)) {
      voteCounts[v] = (voteCounts[v] ?? 0) + 1;
    }
    const bestActor = Object.entries(voteCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

    // Aciertos de roles
    const correctGuesses: Record<string, number> = {};
    for (const [guesserId, targets] of Object.entries(session.guesses)) {
      let correct = 0;
      for (const [targetId, guessedRole] of Object.entries(targets)) {
        if (session.assignments[targetId] === guessedRole) correct++;
      }
      correctGuesses[guesserId] = correct;
    }

    return { assignments: session.assignments, bestActor, correctGuesses };
  }
}

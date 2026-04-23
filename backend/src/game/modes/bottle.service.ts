import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface SpinResult {
  from: string;
  to: string;
  toName: string;
}

@Injectable()
export class BottleService {
  constructor(private readonly redis: RedisService) {}

  async spin(roomId: string, spinnerId: string, players: { id: string; username: string }[]): Promise<SpinResult> {
    const others = players.filter((p) => p.id !== spinnerId);
    if (others.length === 0) throw new Error('No hay otros jugadores en la sala');

    const target = others[Math.floor(Math.random() * others.length)];

    await this.redis.set(
      `room:${roomId}:last_spin`,
      JSON.stringify({ from: spinnerId, to: target.id }),
      300,
    );

    return { from: spinnerId, to: target.id, toName: target.username };
  }

  async signalInterest(roomId: string, fromId: string, toId: string): Promise<{ matched: boolean }> {
    const client = this.redis.getClient();
    await client.sadd(`room:${roomId}:interests:${fromId}`, toId);

    // Regla 1+4: comprobar match mutuo en silencio
    const mutual = await client.sismember(`room:${roomId}:interests:${toId}`, fromId);
    if (mutual) {
      const matchKey = `from${[fromId, toId].sort().join('-to')}`;
      await client.sadd(`room:${roomId}:matches`, matchKey);
    }

    return { matched: false }; // Nunca revelar durante la partida
  }
}

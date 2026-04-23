import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface Carta {
  cardId: string;
  ownerId: string;
  text: string;
  played: boolean;
}

@Injectable()
export class CartasService {
  private readonly CARDS_PER_PLAYER = 3;

  constructor(
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async dealCards(roomId: string, playerIds: string[]): Promise<void> {
    for (const playerId of playerIds) {
      const cards: Carta[] = [];
      for (let i = 0; i < this.CARDS_PER_PLAYER; i++) {
        const text = await new Promise<string>((resolve) => {
          this.eventEmitter.emit('challenges.get', {
            type: 'truth',
            intensity: 2,
            tags: ['cartas'],
            callback: (c: { text: string }) => resolve(c.text),
          });
        });
        cards.push({ cardId: crypto.randomUUID(), ownerId: playerId, text, played: false });
      }
      await this.redis.set(`room:${roomId}:cartas:${playerId}`, JSON.stringify(cards), 3600);
    }
  }

  async playCard(roomId: string, playerId: string, cardId: string): Promise<Carta> {
    const raw = await this.redis.get(`room:${roomId}:cartas:${playerId}`);
    if (!raw) throw new Error('Mano no encontrada');

    const cards = JSON.parse(raw) as Carta[];
    const card = cards.find((c) => c.cardId === cardId);
    if (!card) throw new Error('Carta no encontrada');
    if (card.played) throw new Error('Esta carta ya fue jugada');

    card.played = true;
    await this.redis.set(`room:${roomId}:cartas:${playerId}`, JSON.stringify(cards), 3600);

    // Crear votación para esta carta
    await this.redis.set(
      `room:${roomId}:cartas:vote:${cardId}`,
      JSON.stringify({ card, votes: {} }),
      300,
    );

    return card;
  }

  async voteCard(
    roomId: string,
    cardId: string,
    voterId: string,
    verdict: 'truth' | 'lie',
  ): Promise<{ totalVotes: number; truthVotes: number }> {
    const raw = await this.redis.get(`room:${roomId}:cartas:vote:${cardId}`);
    if (!raw) throw new Error('Votación no encontrada');

    const data = JSON.parse(raw) as { card: Carta; votes: Record<string, string> };
    data.votes[voterId] = verdict;
    await this.redis.set(`room:${roomId}:cartas:vote:${cardId}`, JSON.stringify(data), 300);

    const votes = Object.values(data.votes);
    return {
      totalVotes: votes.length,
      truthVotes: votes.filter((v) => v === 'truth').length,
    };
  }
}

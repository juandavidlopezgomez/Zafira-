import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Modo Oscuro: requiere PremiumGuard + AgeVerificationGuard (18+)
// Los retos provienen de dark_challenges (tabla separada, intensidad 4-5)

@Injectable()
export class OscuroService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async getDarkChallenge(): Promise<{ text: string }> {
    return new Promise((resolve) => {
      this.eventEmitter.emit('challenges.getDark', {
        intensity: 4,
        callback: (c: { text: string }) => resolve(c),
      });
    });
  }
}

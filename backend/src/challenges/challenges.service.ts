import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Challenge, DarkChallenge } from './challenges.module';
import { AiService } from '../ai/ai.service';

interface ChallengeRequest {
  type: string;
  intensity: number;
  tags: string[];
  callback: (challenge: { id?: string; text: string }) => void;
}

interface DarkChallengeRequest {
  intensity: number;
  callback: (challenge: { text: string }) => void;
}

@Injectable()
export class ChallengesService {
  // Pool mínimo antes de llamar a IA (Regla 3)
  private readonly MIN_POOL = 3;

  constructor(
    @InjectRepository(Challenge)
    private readonly challengeRepo: Repository<Challenge>,
    @InjectRepository(DarkChallenge)
    private readonly darkRepo: Repository<DarkChallenge>,
    private readonly ai: AiService,
  ) {}

  // Regla 12: escucha eventos cross-módulo
  @OnEvent('challenges.get')
  async onGetChallenge(req: ChallengeRequest): Promise<void> {
    const challenge = await this.getChallenge(req.type, req.intensity, req.tags);
    req.callback(challenge);
  }

  @OnEvent('challenges.getDark')
  async onGetDarkChallenge(req: DarkChallengeRequest): Promise<void> {
    const challenge = await this.getDarkChallenge(req.intensity);
    req.callback(challenge);
  }

  async getChallenge(
    type: string,
    intensity: number,
    tags: string[],
  ): Promise<{ id?: string; text: string }> {
    // 1. Buscar en el pool de BD
    const pool = await this.challengeRepo.find({
      where: { mode: type, intensity },
      take: 20,
    });

    if (pool.length >= this.MIN_POOL) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return { id: pick.id, text: pick.textEs };
    }

    // 2. Fallback IA (Regla 3)
    const text = await this.ai.generateChallenge(type, intensity, tags);

    // Guardar en pool para reutilizar
    const saved = this.challengeRepo.create({ mode: type, intensity, textEs: text, isAi: true });
    await this.challengeRepo.save(saved);

    return { id: saved.id, text };
  }

  async getDarkChallenge(intensity: number): Promise<{ text: string }> {
    const pool = await this.darkRepo.find({ where: { intensity }, take: 10 });

    if (pool.length >= this.MIN_POOL) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return { text: pick.textEs };
    }

    const text = await this.ai.generateChallenge('oscuro', intensity, ['adulto', 'íntimo', '18+']);
    const saved = this.darkRepo.create({ intensity, textEs: text });
    await this.darkRepo.save(saved);
    return { text };
  }
}

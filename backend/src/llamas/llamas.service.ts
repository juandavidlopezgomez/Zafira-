import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlamasTransaction } from '../database/entities/llamas-transaction.entity.js';

@Injectable()
export class LlamasService {
  constructor(
    @InjectRepository(LlamasTransaction)
    private readonly txRepo: Repository<LlamasTransaction>,
  ) {}

  async getBalance(userId: string): Promise<number> {
    const result = await this.txRepo
      .createQueryBuilder('tx')
      .select('COALESCE(SUM(tx.amount), 0)', 'balance')
      .where('tx.userId = :userId', { userId })
      .getRawOne<{ balance: string }>();

    return parseInt(result?.balance ?? '0', 10);
  }

  async credit(
    userId: string,
    amount: number,
    reason: string,
    sessionId?: string,
  ): Promise<LlamasTransaction> {
    const tx = this.txRepo.create({ userId, amount: Math.abs(amount), reason, sessionId });
    return this.txRepo.save(tx);
  }

  async debit(
    userId: string,
    amount: number,
    reason: string,
    sessionId?: string,
  ): Promise<LlamasTransaction> {
    const balance = await this.getBalance(userId);
    if (balance < amount) {
      throw new BadRequestException('Saldo de LLAMAS insuficiente');
    }
    const tx = this.txRepo.create({ userId, amount: -Math.abs(amount), reason, sessionId });
    return this.txRepo.save(tx);
  }

  async getHistory(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: LlamasTransaction[]; total: number }> {
    const [items, total] = await this.txRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { LlamasService } from './llamas.service.js';
import type { JwtPayload } from '../auth/strategies/jwt.strategy.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller('llamas')
@UseGuards(JwtAuthGuard)
export class LlamasController {
  constructor(private readonly llamasService: LlamasService) {}

  @Get('balance')
  async getBalance(@CurrentUser() user: JwtPayload): Promise<{ balance: number }> {
    const balance = await this.llamasService.getBalance(user.sub);
    return { balance };
  }

  @Get('history')
  async getHistory(
    @CurrentUser() user: JwtPayload,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<{ items: unknown[]; total: number; page: number; limit: number }> {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const { items, total } = await this.llamasService.getHistory(user.sub, pageNum, limitNum);
    return { items, total, page: pageNum, limit: limitNum };
  }
}

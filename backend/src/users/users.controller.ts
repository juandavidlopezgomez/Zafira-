import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UsersService } from './users.service.js';
import { LlamasService } from '../llamas/llamas.service.js';
import type { JwtPayload } from '../auth/strategies/jwt.strategy.js';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly llamasService: LlamasService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@CurrentUser() jwtUser: JwtPayload): Promise<{
    id: string;
    username: string;
    email: string;
    avatarUrl?: string;
    age?: number;
    isPremium: boolean;
    charismaPts: number;
    referralCode?: string;
    llamasBalance: number;
    createdAt: Date;
  }> {
    const user = await this.usersService.findById(jwtUser.sub);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const llamasBalance = await this.llamasService.getBalance(user.id);

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      age: user.age,
      isPremium: user.isPremium,
      charismaPts: user.charismaPts,
      referralCode: user.referralCode,
      llamasBalance,
      createdAt: user.createdAt,
    };
  }

  @Get(':id/profile')
  async getPublicProfile(@Param('id') id: string): Promise<{
    id: string;
    username: string;
    avatarUrl?: string;
    charismaPts: number;
    isPremium: boolean;
    createdAt: Date;
  }> {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    return {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      charismaPts: user.charismaPts,
      isPremium: user.isPremium,
      createdAt: user.createdAt,
    };
  }
}

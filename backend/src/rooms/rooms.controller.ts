import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RoomsService } from './rooms.service.js';
import { CreateRoomDto } from './dto/create-room.dto.js';
import type { JwtPayload } from '../auth/strategies/jwt.strategy.js';
import type { Room } from '../database/entities/room.entity.js';

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  async createRoom(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRoomDto,
  ): Promise<{ room: Room; qrUrl: string }> {
    return this.roomsService.createRoom(user.sub, dto.mode);
  }

  @Get(':code')
  async getRoom(@Param('code') code: string): Promise<Room> {
    const room = await this.roomsService.findByCode(code);
    if (!room) {
      throw new NotFoundException('Sala no encontrada');
    }
    return room;
  }

  @Post(':code/join')
  async joinRoom(
    @Param('code') code: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<Room> {
    return this.roomsService.joinRoom(code, user.sub);
  }
}

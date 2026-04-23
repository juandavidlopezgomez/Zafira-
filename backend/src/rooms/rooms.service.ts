import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { customAlphabet } from 'nanoid';
import * as QRCode from 'qrcode';
import { Room } from '../database/entities/room.entity.js';
import { RedisService } from '../redis/redis.service.js';

const generateCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

const ROOM_STATE_TTL = 3600;

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,
    private readonly redisService: RedisService,
  ) {}

  async createRoom(
    hostId: string,
    mode: string,
  ): Promise<{ room: Room; qrUrl: string }> {
    const code = generateCode();

    const room = this.roomRepo.create({ code, hostId, mode });
    const saved = await this.roomRepo.save(room);

    const roomStateKey = `room:${saved.id}:state`;
    await this.redisService.set(
      roomStateKey,
      JSON.stringify({ roomId: saved.id, code, mode, status: 'waiting', players: [] }),
      ROOM_STATE_TTL,
    );

    const joinUrl = `https://battleflirt.app/sala/${code}`;
    const qrUrl = await QRCode.toDataURL(joinUrl);

    return { room: saved, qrUrl };
  }

  async findByCode(code: string): Promise<Room | null> {
    return this.roomRepo.findOne({ where: { code: code.toUpperCase() } });
  }

  async getPlayers(roomId: string): Promise<{ id: string; username: string }[]> {
    const raw = await this.redisService.hgetall(`room:${roomId}:players`);
    return Object.entries(raw).map(([id, username]) => ({ id, username }));
  }

  async addPlayer(roomId: string, userId: string, username: string): Promise<void> {
    await this.redisService.hset(`room:${roomId}:players`, userId, username);
    await this.redisService.expire(`room:${roomId}:players`, ROOM_STATE_TTL);
  }

  async setRoomActive(roomId: string): Promise<void> {
    await this.roomRepo.update(roomId, { status: 'active' });
  }

  async joinRoom(code: string, userId: string): Promise<Room> {
    const room = await this.findByCode(code);
    if (!room) throw new NotFoundException('Sala no encontrada');

    if (room.status !== 'waiting') {
      throw new BadRequestException('La sala ya no acepta jugadores');
    }

    const roomStateKey = `room:${room.id}:state`;
    const raw = await this.redisService.get(roomStateKey);
    const state = raw
      ? (JSON.parse(raw) as { players: string[] })
      : { players: [] };

    if (state.players.length >= room.maxPlayers) {
      throw new BadRequestException('La sala está llena');
    }

    if (!state.players.includes(userId)) {
      state.players.push(userId);
      await this.redisService.set(roomStateKey, JSON.stringify(state), ROOM_STATE_TTL);
    }

    return room;
  }
}

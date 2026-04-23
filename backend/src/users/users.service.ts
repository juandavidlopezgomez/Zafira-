import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity.js';

interface CreateUserDto {
  username: string;
  email: string;
  passwordHash: string;
  referralCode?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async create(dto: CreateUserDto): Promise<User> {
    const user = this.userRepo.create({
      username: dto.username,
      email: dto.email,
      passwordHash: dto.passwordHash,
      referralCode: dto.referralCode,
    });
    return this.userRepo.save(user);
  }

  async updatePremium(userId: string, isPremium: boolean): Promise<void> {
    await this.userRepo.update(userId, { isPremium });
  }

  async updateReferralCode(userId: string, referralCode: string): Promise<void> {
    await this.userRepo.update(userId, { referralCode });
  }
}

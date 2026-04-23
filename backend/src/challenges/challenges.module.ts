import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChallengesService } from './challenges.service';
import { AiModule } from '../ai/ai.module';

// Entidades se definen inline aquí para no romper imports circulares
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('challenges')
export class Challenge {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 32 }) mode!: string;
  @Column({ nullable: true }) category?: string;
  @Column({ default: 1 }) intensity!: number;
  @Column({ name: 'text_es', type: 'text' }) textEs!: string;
  @Column({ name: 'is_premium', default: false }) isPremium!: boolean;
  @Column({ name: 'is_ai', default: false }) isAi!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Entity('dark_challenges')
export class DarkChallenge {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ default: 4 }) intensity!: number;
  @Column({ name: 'text_es', type: 'text' }) textEs!: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Module({
  imports: [TypeOrmModule.forFeature([Challenge, DarkChallenge]), AiModule],
  providers: [ChallengesService],
  exports: [ChallengesService],
})
export class ChallengesModule {}

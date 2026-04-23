import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HiloGateway } from './hilo.gateway.js';
import { HiloService } from './hilo.service.js';
import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';

import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';

@Entity('hilos')
export class Hilo {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'room_id' }) roomId!: string;
  @Column({ length: 16 }) type!: string;
  @Column({ default: 1 }) tension!: number;
  @Column({ name: 'is_premium', default: false }) isPremium!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Entity('hilo_messages')
export class HiloMessage {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'hilo_id' }) hiloId!: string;
  @ManyToOne(() => Hilo) @JoinColumn({ name: 'hilo_id' }) hilo!: Hilo;
  @Column({ name: 'user_id', nullable: true }) userId?: string;
  @Column({ name: 'alias_id', nullable: true, length: 32 }) aliasId?: string;
  @Column({ type: 'text' }) content!: string;
  @Column({ default: false }) moderated!: boolean;
  @Column({ default: false }) rejected!: boolean;
  @Column({ nullable: true }) reaction?: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Entity('hilo_tension_history')
export class HiloTensionHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'hilo_id' }) hiloId!: string;
  @Column() tension!: number;
  @CreateDateColumn({ name: 'recorded_at' }) recordedAt!: Date;
}

@Entity('hilo_confessions')
export class HiloConfession {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'hilo_id' }) hiloId!: string;
  @Column({ name: 'alias_id' }) aliasId!: string;
  @Column({ type: 'text' }) content!: string;
  @Column({ default: false }) revealed!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Hilo, HiloMessage, HiloTensionHistory, HiloConfession]),
    AiModule,
    AuthModule,
  ],
  providers: [HiloGateway, HiloService],
  exports: [HiloService],
})
export class HiloModule {}

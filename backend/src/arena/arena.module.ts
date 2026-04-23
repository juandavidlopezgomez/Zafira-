import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArenaGateway } from './arena.gateway.js';
import { ArenaService } from './arena.service.js';
import { AuthModule } from '../auth/auth.module.js';

import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';

@Entity('arena_stadiums')
export class ArenaStadium {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'room_id' }) roomId!: string;
  @Column({ length: 32 }) feature!: string;
  @Column({ default: 'pending' }) status!: string;
  @Column({ name: 'started_at', nullable: true }) startedAt?: Date;
  @Column({ name: 'ended_at', nullable: true }) endedAt?: Date;
}

@Entity('arena_events')
export class ArenaEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'stadium_id' }) stadiumId!: string;
  @ManyToOne(() => ArenaStadium) @JoinColumn({ name: 'stadium_id' }) stadium!: ArenaStadium;
  @Column({ name: 'event_type', length: 32 }) eventType!: string;
  @Column({ type: 'json', default: '{}' }) payload!: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Entity('arena_votes')
export class ArenaVote {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'stadium_id' }) stadiumId!: string;
  @Column({ name: 'voter_id' }) voterId!: string;
  @Column({ name: 'target_id', nullable: true }) targetId?: string;
  @Column({ name: 'vote_type', length: 32 }) voteType!: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Module({
  imports: [TypeOrmModule.forFeature([ArenaStadium, ArenaEvent, ArenaVote]), AuthModule],
  providers: [ArenaGateway, ArenaService],
  exports: [ArenaService],
})
export class ArenaModule {}

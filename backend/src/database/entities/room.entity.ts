import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity.js';

@Entity('rooms')
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 8 })
  code: string;

  @Column({ name: 'host_id' })
  hostId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'host_id' })
  host: User;

  @Column({ length: 32 })
  mode: string;

  @Column({ default: 'waiting' })
  status: 'waiting' | 'active' | 'finished';

  @Column({ name: 'max_players', default: 12 })
  maxPlayers: number;

  @Column({ name: 'is_premium', default: false })
  isPremium: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

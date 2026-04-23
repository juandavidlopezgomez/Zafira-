import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity.js';

@Entity('llamas_transactions')
export class LlamasTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column('int')
  amount: number; // positivo=crédito, negativo=débito

  @Column({ length: 64 })
  reason: string;

  @Column({ name: 'session_id', nullable: true })
  sessionId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity.js';

@Entity('premium_subscriptions')
export class PremiumSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'stripe_sub_id', unique: true, nullable: true })
  stripeSubId?: string;

  @Column({ default: 'active' })
  status: 'active' | 'canceled' | 'past_due';

  @Column()
  plan: 'monthly' | 'annual';

  @Column({ name: 'current_period_end', nullable: true })
  currentPeriodEnd?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

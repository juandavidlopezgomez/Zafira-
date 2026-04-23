import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { PremiumSubscription } from '../database/entities/premium-subscription.entity.js';
import { UsersService } from '../users/users.service.js';
import { RedisService } from '../redis/redis.service.js';

const GRACE_PERIOD_DAYS = 3;

@Injectable()
export class PaymentsService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
    @InjectRepository(PremiumSubscription)
    private readonly subRepo: Repository<PremiumSubscription>,
  ) {
    this.stripe = new Stripe(this.configService.get<string>('STRIPE_SECRET_KEY')!);
  }

  async createCheckoutSession(
    userId: string,
    email: string,
  ): Promise<{ url: string }> {
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: email,
      line_items: [
        {
          price: this.configService.get<string>('STRIPE_PRICE_ID')!,
          quantity: 1,
        },
      ],
      success_url: `${this.configService.get<string>('FRONTEND_URL')}/premium/success`,
      cancel_url: `${this.configService.get<string>('FRONTEND_URL')}/premium`,
      metadata: { userId },
    });

    return { url: session.url! };
  }

  async activatePremium(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata?.['userId'];
    if (!userId) {
      this.logger.warn(`Subscription ${subscription.id} sin userId en metadata`);
      return;
    }

    await this.usersService.updatePremium(userId, true);

    // cancel_at contiene la fecha de vencimiento cuando el usuario cancela al final del período
    const periodEnd =
      typeof subscription.cancel_at === 'number'
        ? new Date(subscription.cancel_at * 1000)
        : undefined;

    await this.subRepo.upsert(
      {
        userId,
        stripeSubId: subscription.id,
        status: 'active',
        plan: this.resolvePlan(subscription),
        currentPeriodEnd: periodEnd,
      },
      { conflictPaths: ['stripeSubId'] },
    );

    this.logger.log(`Premium activado para usuario ${userId}`);
  }

  async deactivatePremium(customerId: string): Promise<void> {
    const sub = await this.subRepo.findOne({
      where: { status: 'active' },
      relations: ['user'],
    });

    if (!sub) {
      this.logger.warn(`No se encontró suscripción activa para customer ${customerId}`);
      return;
    }

    await this.usersService.updatePremium(sub.userId, false);
    await this.subRepo.update(sub.id, { status: 'canceled' });

    this.logger.log(`Premium desactivado para usuario ${sub.userId}`);
  }

  async startGracePeriod(customerId: string): Promise<void> {
    const sub = await this.subRepo.findOne({ where: { status: 'active' } });
    if (!sub) return;

    const gracePeriodEnd = Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
    const gracePeriodKey = `premium:grace:${sub.userId}`;
    await this.redisService.set(
      gracePeriodKey,
      gracePeriodEnd.toString(),
      GRACE_PERIOD_DAYS * 24 * 60 * 60,
    );

    await this.subRepo.update(sub.id, { status: 'past_due' });

    this.logger.log(
      `Periodo de gracia iniciado para usuario ${sub.userId}, customer ${customerId}`,
    );
  }

  private resolvePlan(subscription: Stripe.Subscription): 'monthly' | 'annual' {
    const interval = subscription.items.data[0]?.plan?.interval;
    return interval === 'year' ? 'annual' : 'monthly';
  }
}

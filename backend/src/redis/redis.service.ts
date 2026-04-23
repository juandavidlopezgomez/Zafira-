import { Injectable } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

// Adapter that keeps existing RedisService interface but delegates to in-memory CacheService.
@Injectable()
export class RedisService {
  constructor(private readonly cache: CacheService) {}

  async get(key: string): Promise<string | null> {
    return this.cache.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    return this.cache.set(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    return this.cache.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.cache.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    return this.cache.expire(key, ttlSeconds);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.cache.hget(key, field);
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    return this.cache.hset(key, field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.cache.hgetall(key);
  }

  async publish(channel: string, message: string): Promise<void> {
    return this.cache.publish(channel, message);
  }

  getClient(): CacheService {
    return this.cache.getClient();
  }
}

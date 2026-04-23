import { Injectable } from '@nestjs/common';

interface CacheEntry {
  value: string;
  expiresAt?: number;
}

@Injectable()
export class CacheService {
  private readonly store = new Map<string, CacheEntry>();
  private readonly hstore = new Map<string, Map<string, string>>();
  private readonly counters = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
    this.hstore.delete(key);
    this.counters.delete(key);
  }

  async incr(key: string): Promise<number> {
    const current = this.counters.get(key) ?? 0;
    const next = current + 1;
    this.counters.set(key, next);
    return next;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
    const hash = this.hstore.get(key);
    if (hash) {
      // store expiry alongside hash
      this.store.set(`${key}:__ttl__`, { value: '', expiresAt: Date.now() + ttlSeconds * 1000 });
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.hstore.get(key)?.get(field) ?? null;
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    if (!this.hstore.has(key)) {
      this.hstore.set(key, new Map());
    }
    this.hstore.get(key)!.set(field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const map = this.hstore.get(key);
    if (!map) return {};
    return Object.fromEntries(map.entries());
  }

  async publish(_channel: string, _message: string): Promise<void> {
    // No-op for single-server deployment; use EventEmitter2 for internal pub/sub
  }

  getClient(): this {
    return this;
  }
}

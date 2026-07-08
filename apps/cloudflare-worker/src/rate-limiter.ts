type RateLimitConfig = {
  windowMs: number;
  max: number;
};

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

export class RateLimiter {
  private readonly records = new Map<string, RateLimitRecord>();
  private lastPrunedAt = 0;
  private readonly pruneIntervalMs: number;

  constructor(private readonly config: RateLimitConfig) {
    this.pruneIntervalMs = Math.max(config.windowMs, 60_000);
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    this.pruneExpired(now);
    const record = this.records.get(key);

    if (!record || now > record.resetAt) {
      this.records.set(key, {
        count: 1,
        resetAt: now + this.config.windowMs
      });
      return true;
    }

    if (record.count < this.config.max) {
      record.count += 1;
      return true;
    }

    return false;
  }

  private pruneExpired(now: number): void {
    if (now - this.lastPrunedAt < this.pruneIntervalMs) {
      return;
    }

    this.lastPrunedAt = now;

    for (const [key, record] of this.records.entries()) {
      if (now > record.resetAt) {
        this.records.delete(key);
      }
    }
  }
}

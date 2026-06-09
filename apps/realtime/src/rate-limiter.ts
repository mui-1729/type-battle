import { logger } from "./logger.js";

type RateLimitConfig = {
  windowMs: number;
  max: number;
};

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

class RateLimiter {
  private records = new Map<string, RateLimitRecord>();

  constructor(private config: RateLimitConfig) {}

  isAllowed(key: string): boolean {
    const now = Date.now();
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

  getResetAt(key: string): number {
    return this.records.get(key)?.resetAt ?? Date.now();
  }
}

// Configuration based on docs/features/observability-rate-limit.md
const roomCreateIpLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });
const roomCreateGuestLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 10 });

const roomJoinIpLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 100 });
const roomJoinGuestLimiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });

const progressLimiter = new RateLimiter({ windowMs: 1000, max: 30 });

export function checkRoomCreateLimit(ip: string, guestId: string): { allowed: boolean; error?: string } {
  if (!roomCreateIpLimiter.isAllowed(ip)) {
    logger.warn({ event: "rate_limit_exceeded", type: "room_create_ip", ip });
    return { allowed: false, error: "リクエストが多すぎます。しばらく時間をおいて試してください。(IP)" };
  }
  if (!roomCreateGuestLimiter.isAllowed(guestId)) {
    logger.warn({ event: "rate_limit_exceeded", type: "room_create_guest", guestId });
    return { allowed: false, error: "リクエストが多すぎます。しばらく時間をおいて試してください。(Guest)" };
  }
  return { allowed: true };
}

export function checkRoomJoinLimit(ip: string, guestId: string): { allowed: boolean; error?: string } {
  if (!roomJoinIpLimiter.isAllowed(ip)) {
    logger.warn({ event: "rate_limit_exceeded", type: "room_join_ip", ip });
    return { allowed: false, error: "リクエストが多すぎます。しばらく時間をおいて試してください。(IP)" };
  }
  if (!roomJoinGuestLimiter.isAllowed(guestId)) {
    logger.warn({ event: "rate_limit_exceeded", type: "room_join_guest", guestId });
    return { allowed: false, error: "リクエストが多すぎます。しばらく時間をおいて試してください。(Guest)" };
  }
  return { allowed: true };
}

export function checkProgressLimit(socketId: string): boolean {
  if (!progressLimiter.isAllowed(socketId)) {
    logger.warn({ event: "rate_limit_exceeded", type: "progress_socket", socketId });
    return false;
  }
  return true;
}

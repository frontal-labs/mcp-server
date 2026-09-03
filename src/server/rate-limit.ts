/*
 * Copyright 2026 Frontal Labs, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { Logger } from "winston";

/** Outcome of a rate-limit check for one caller. */
export interface RateLimitDecision {
  /** False when the caller has exhausted its allowance. */
  success: boolean;
  /** Requests permitted per window. */
  limit: number;
  /** Requests left in the current window. */
  remaining: number;
  /** Unix timestamp in milliseconds when the window resets. */
  reset: number;
}

/**
 * A per-caller rate limiter.
 *
 * Kept as an interface so the transport does not depend on Upstash directly:
 * tests substitute a deterministic fake, and a different backend can be
 * dropped in without touching the request path.
 */
export interface RateLimiter {
  limit(identifier: string): Promise<RateLimitDecision>;
}

export interface RateLimitConfig {
  /** Upstash Redis REST URL. Rate limiting is off unless this is set. */
  redisUrl?: string;
  /** Upstash Redis REST token. */
  redisToken?: string;
  /** Requests allowed per window. */
  requests: number;
  /** Window length, as an Upstash duration such as "60 s" or "1 m". */
  window: string;
  /** Key prefix, so the Redis instance can be shared with other apps. */
  prefix: string;
  /**
   * How long to wait for Redis before allowing the request through. Upstash
   * is a network hop; without a bound, a slow Redis would stall every
   * request.
   */
  timeoutMs: number;
}

/**
 * Derive the Redis key for a caller.
 *
 * The bearer token is a live credential, so it is hashed rather than stored
 * in a key that shows up in Redis tooling and analytics. Truncating to 32 hex
 * characters keeps keys short while leaving collisions implausible.
 *
 * When authentication moves to GoTrue this should key on the resolved user or
 * tenant id instead, so a caller cannot reset its own budget by rotating
 * tokens.
 */
export function rateLimitIdentifier(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

/**
 * Build a rate limiter from configuration.
 *
 * Returns undefined when Upstash is not configured, which leaves the HTTP
 * transport unlimited — the same opt-in shape the incident.io integration
 * uses. The sliding-window algorithm avoids the burst-at-the-boundary
 * behaviour of a fixed window.
 */
export function createRateLimiter(
  config: RateLimitConfig,
  logger: Logger
): RateLimiter | undefined {
  if (!(config.redisUrl && config.redisToken)) {
    logger.info(
      "Rate limiting not configured (missing Upstash Redis URL or token), skipping"
    );
    return;
  }

  const ratelimit = new Ratelimit({
    redis: new Redis({ url: config.redisUrl, token: config.redisToken }),
    limiter: Ratelimit.slidingWindow(
      config.requests,
      config.window as Parameters<typeof Ratelimit.slidingWindow>[1]
    ),
    prefix: config.prefix,
    timeout: config.timeoutMs,
    // Short-circuits callers already known to be over budget, so a caller
    // hammering the server does not cost a Redis round trip per request.
    ephemeralCache: new Map(),
  });

  logger.info(
    `Rate limiting enabled: ${config.requests} requests per ${config.window} per caller`
  );

  return {
    async limit(identifier: string): Promise<RateLimitDecision> {
      const result = await ratelimit.limit(identifier);
      // On timeout the SDK lets the request through rather than failing it.
      // That is the behaviour we want, but silently unlimited traffic is not
      // something an operator should have to infer, so say so.
      if (result.reason === "timeout") {
        logger.warn(
          `Rate limit check timed out after ${config.timeoutMs}ms; allowing request. Redis may be unreachable.`
        );
      }
      // Analytics and multi-region sync settle in the background; nothing
      // downstream depends on them, so they are not awaited.
      return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
      };
    },
  };
}

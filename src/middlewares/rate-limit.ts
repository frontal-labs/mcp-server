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

export interface RateLimitDecision {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export interface RateLimiter {
  limit(identifier: string): Promise<RateLimitDecision>;
}

export interface RateLimitConfig {
  redisUrl?: string;
  redisToken?: string;
  requests: number;
  window: string;
  prefix: string;
  timeoutMs: number;
}

export function rateLimitIdentifier(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

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
    ephemeralCache: new Map(),
  });

  logger.info(
    `Rate limiting enabled: ${config.requests} requests per ${config.window} per caller`
  );

  return {
    async limit(identifier: string): Promise<RateLimitDecision> {
      const result = await ratelimit.limit(identifier);
      if (result.reason === "timeout") {
        logger.warn(
          `Rate limit check timed out after ${config.timeoutMs}ms; allowing request. Redis may be unreachable.`
        );
      }
      return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
      };
    },
  };
}

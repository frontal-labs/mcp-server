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
import type { Logger } from "winston";

/**
 * Frontal HTTP Client types.
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
}

export interface FrontalClientOptions {
  baseUrl: string;
  apiKey?: string;
  region?: string;
  logger: Logger;
  retry?: Partial<RetryConfig>;
  timeoutMs?: number;
}

export interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
  token?: string;
  region?: string;
  idempotencyKey?: string;
  skipAuth?: boolean;
  signal?: AbortSignal;
}

export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  reset?: string;
}

export interface FrontalResponse<T = unknown> {
  data: T;
  status: number;
  rateLimit: RateLimitInfo;
  requestId: string;
}

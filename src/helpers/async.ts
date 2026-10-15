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

/**
 * Async helpers.
 */

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    jitter?: boolean;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 500,
    maxDelay = 10_000,
    jitter = true,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error) || attempt === maxAttempts) throw error;
      const exp = baseDelay * 2 ** (attempt - 1);
      const delay = Math.min(
        exp + (jitter ? Math.random() * 0.1 * exp : 0),
        maxDelay
      );
      await sleep(delay);
    }
  }
  throw lastError;
}

/**
 * Run multiple promises with a concurrency limit.
 */
export async function promisePool<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const promise = task().then((result) => {
      results.push(result);
    });
    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      const index = executing.indexOf(promise);
      if (index > -1) executing.splice(index, 1);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Timeout a promise.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutError = new Error("Operation timed out")
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(timeoutError), ms)),
  ]);
}

/**
 * Run a function with a timeout.
 */
export async function runWithTimeout<T>(
  fn: () => Promise<T>,
  ms: number
): Promise<T> {
  return withTimeout(fn(), ms);
}

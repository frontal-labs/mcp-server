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
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped authentication context.
 *
 * The HTTP transport can serve multiple tenants, each presenting their own
 * `Authorization: Bearer frt_...` header. We stash the per-request token in an
 * AsyncLocalStorage so tool handlers (which run inside the request's async
 * context) can resolve the caller's token without threading it through every
 * signature. stdio has no per-request token and falls back to the env key.
 */
interface AuthStore {
  token?: string;
}

const storage = new AsyncLocalStorage<AuthStore>();

/** Run `fn` with the given per-request bearer token in scope. */
export function runWithToken<T>(token: string | undefined, fn: () => T): T {
  return storage.run({ token }, fn);
}

/** The token bound to the current request, if any. */
export function getRequestToken(): string | undefined {
  return storage.getStore()?.token;
}

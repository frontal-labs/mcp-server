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

import { vi } from "vitest";

type QueryResult = {
  data?: unknown;
  error?: { message: string; code?: string } | null;
};

/**
 * Builds a chainable Supabase query mock that resolves at terminal methods.
 */
export function createQueryBuilder(result: QueryResult = { data: null, error: null }) {
  const builder: Record<string, unknown> = {};

  const terminal = vi.fn().mockResolvedValue(result);
  const chain = vi.fn(() => builder);

  for (const method of [
    "select",
    "insert",
    "upsert",
    "update",
    "delete",
    "eq",
    "neq",
    "in",
    "order",
    "limit",
  ]) {
    builder[method] = chain;
  }

  builder.maybeSingle = terminal;
  builder.single = terminal;
  builder.then = undefined;

  // Allow awaiting the builder directly after update/insert/upsert chains
  Object.defineProperty(builder, "then", {
    value: (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    configurable: true,
  });

  return { builder, terminal, chain };
}

export function createSupabaseMock(options?: {
  user?: { id: string; email?: string } | null;
  fromResults?: Record<string, QueryResult>;
  rpcResult?: QueryResult;
  authError?: Error | null;
  exchangeError?: Error | null;
}) {
  const user = options?.user === undefined ? { id: "user-1", email: "test@example.com" } : options.user;
  const fromResults = options?.fromResults ?? {};
  const builders: Record<string, ReturnType<typeof createQueryBuilder>> = {};

  const from = vi.fn((table: string) => {
    const result = fromResults[table] ?? { data: null, error: null };
    const qb = createQueryBuilder(result);
    builders[table] = qb;
    return qb.builder;
  });

  const rpc = vi.fn().mockResolvedValue(options?.rpcResult ?? { data: 1, error: null });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: options?.authError ?? null,
      }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        error: options?.exchangeError ?? null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
    },
    from,
    rpc,
    builders,
  };
}

export function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    user_id: "user-1",
    tier: "free",
    status: "active",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

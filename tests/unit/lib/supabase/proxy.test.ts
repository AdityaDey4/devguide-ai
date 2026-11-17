import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The proxy's redirects (FR-AUTH-2), with the session check replaced by a fake.

const mocks = vi.hoisted(() => ({ claims: null as object | null }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: { claims: mocks.claims } }) },
  }),
}));
vi.mock("@/lib/env.client", () => ({
  publicEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "key",
  },
}));

import { updateSession } from "@/lib/supabase/proxy";

const go = (path: string) =>
  updateSession(new NextRequest(`http://localhost:3000${path}`));
const redirectedTo = (response: Response) =>
  response.headers.get("location")
    ? new URL(response.headers.get("location")!).pathname
    : null;

beforeEach(() => {
  mocks.claims = null;
});

describe("signed out", () => {
  it("may open the landing and sign-in pages", async () => {
    expect(redirectedTo(await go("/"))).toBeNull();
    expect(redirectedTo(await go("/login"))).toBeNull();
  });

  it("is sent to sign in from a private page", async () => {
    expect(redirectedTo(await go("/g/zod"))).toBe("/login");
  });
});

describe("signed in", () => {
  beforeEach(() => {
    mocks.claims = { sub: "u1" };
  });

  it("skips the landing and sign-in pages and goes to search", async () => {
    expect(redirectedTo(await go("/"))).toBe("/search");
    expect(redirectedTo(await go("/login"))).toBe("/search");
  });

  it("opens private pages as usual", async () => {
    expect(redirectedTo(await go("/g/zod"))).toBeNull();
  });
});

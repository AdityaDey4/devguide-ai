import type { LookupOptions } from "node:dns";
import { beforeEach, describe, expect, it, vi } from "vitest";

// DNS is replaced, so tests control what a hostname "resolves" to and need no network.
const dnsMock = vi.hoisted(() => ({
  promisesLookup: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("node:dns", () => ({
  default: {
    promises: { lookup: dnsMock.promisesLookup },
    lookup: dnsMock.lookup,
  },
}));

import {
  assertSafeUrl,
  isBlockedAddress,
  safeLookup,
  SsrfBlockedError,
  type SsrfReason,
} from "@/lib/fetch/ssrfGuard";

const PUBLIC = [{ address: "93.184.216.34", family: 4 }];

beforeEach(() => {
  dnsMock.promisesLookup.mockReset().mockResolvedValue(PUBLIC);
  dnsMock.lookup.mockReset();
});

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "169.254.0.1",
    "0.0.0.0",
    "100.64.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "198.18.0.1",
  ])("blocks the IPv4 address %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    "::1",
    "::",
    "fe80::1",
    "fe80::1%eth0",
    "fc00::1",
    "fd00:ec2::254",
    "ff02::1",
    "2001:db8::1",
  ])("blocks the IPv6 address %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "64:ff9b::7f00:1",
    "2002:7f00:1::1",
  ])("blocks %s, an IPv6 form that hides an IPv4 address", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(["not-an-ip", ""])(
    "treats %j (not an IP at all) as blocked",
    (value) => {
      expect(isBlockedAddress(value)).toBe(true);
    },
  );

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "172.15.255.255",
    "172.32.0.1",
    "192.169.0.1",
    "11.0.0.1",
    "2606:4700:4700::1111",
    "2a00:1450:4001:81b::200e",
  ])("allows the public address %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

async function reasonFor(url: string): Promise<SsrfReason | "allowed"> {
  try {
    await assertSafeUrl(url);
    return "allowed";
  } catch (error) {
    if (error instanceof SsrfBlockedError) return error.reason;
    throw error;
  }
}

describe("assertSafeUrl: refuses unsafe URLs", () => {
  it.each([
    ["http://127.0.0.1/", "address"],
    ["http://169.254.169.254/latest/meta-data/", "address"],
    ["http://10.0.0.5/", "address"],
    ["http://[::1]/", "address"],
    ["http://[::ffff:127.0.0.1]/", "address"],
    ["http://[fd00:ec2::254]/", "address"],
    // The URL parser turns these disguises into 127.0.0.1, so they are caught as addresses.
    ["http://2130706433/", "address"],
    ["http://0x7f.0.0.1/", "address"],
    ["http://0177.0.0.1/", "address"],
    ["http://127.1/", "address"],
    ["http://0/", "address"],
    ["http://localhost/", "hostname"],
    ["http://localhost./", "hostname"],
    ["http://LOCALHOST/", "hostname"],
    ["http://foo.localhost/", "hostname"],
    ["http://metadata.google.internal/", "hostname"],
    ["http://printer.local/", "hostname"],
    ["http://redis/", "hostname"],
    ["ftp://example.com/", "protocol"],
    ["file:///etc/passwd", "protocol"],
    ["javascript:alert(1)", "protocol"],
    ["not a url", "protocol"],
    ["http://user:pass@example.com/", "credentials"],
    ["http://example.com:22/", "port"],
    ["http://example.com:6379/", "port"],
    ["https://example.com:8443/", "port"],
  ] as const)("%s is refused (%s)", async (url, reason) => {
    expect(await reasonFor(url)).toBe(reason);
  });

  it("refuses a hostname that DNS points at a private address", async () => {
    dnsMock.promisesLookup.mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ]);
    expect(await reasonFor("http://localtest.me/")).toBe("address");
  });

  it("refuses a hostname when ANY of its addresses is private (an attacker can mix them)", async () => {
    dnsMock.promisesLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ]);
    expect(await reasonFor("http://mixed.example.com/")).toBe("address");
  });

  it("refuses a hostname that does not resolve", async () => {
    dnsMock.promisesLookup.mockRejectedValue(new Error("ENOTFOUND"));
    expect(await reasonFor("http://nothing.example.com/")).toBe("dns");
    dnsMock.promisesLookup.mockResolvedValue([]);
    expect(await reasonFor("http://empty.example.com/")).toBe("dns");
  });
});

describe("assertSafeUrl: allows normal URLs", () => {
  it("returns the URL and the vetted addresses for a public host", async () => {
    const result = await assertSafeUrl("https://example.com/docs?x=1");
    expect(result.url.href).toBe("https://example.com/docs?x=1");
    expect(result.addresses).toEqual(["93.184.216.34"]);
  });

  it("allows a public IP written directly, and explicit default ports", async () => {
    expect(await reasonFor("https://8.8.8.8/")).toBe("allowed");
    expect(await reasonFor("http://example.com:80/")).toBe("allowed");
    expect(await reasonFor("https://example.com:443/")).toBe("allowed");
  });
});

describe("safeLookup (the connect-time check)", () => {
  const call = (options: LookupOptions) =>
    new Promise<{ error: Error | null; address: unknown; family?: number }>(
      (resolve) =>
        safeLookup("host.test", options, (error, address, family) =>
          resolve({ error, address, family }),
        ),
    );

  it("refuses to connect when the name now points at a private address (DNS rebinding)", async () => {
    dnsMock.lookup.mockImplementation((_host, _options, callback) =>
      callback(null, [{ address: "127.0.0.1", family: 4 }]),
    );
    const { error } = await call({});
    expect(error).toBeInstanceOf(SsrfBlockedError);
    expect((error as SsrfBlockedError).reason).toBe("address");
  });

  it("returns one address when asked for one, like Node's normal lookup", async () => {
    dnsMock.lookup.mockImplementation((_host, _options, callback) =>
      callback(null, PUBLIC),
    );
    expect(await call({})).toMatchObject({
      error: null,
      address: "93.184.216.34",
      family: 4,
    });
  });

  it("returns all addresses when asked for all", async () => {
    dnsMock.lookup.mockImplementation((_host, _options, callback) =>
      callback(null, PUBLIC),
    );
    expect(await call({ all: true })).toMatchObject({
      error: null,
      address: PUBLIC,
    });
  });

  it("passes a DNS failure through", async () => {
    dnsMock.lookup.mockImplementation((_host, _options, callback) =>
      callback(new Error("ENOTFOUND")),
    );
    expect((await call({})).error?.message).toBe("ENOTFOUND");
  });
});

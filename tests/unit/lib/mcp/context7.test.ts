import { describe, expect, it, vi } from "vitest";
import { fetchSnippets } from "@/lib/mcp/context7";
import { parseLibraries, parseSnippets } from "@/lib/mcp/context7/parse";
import type { Context7Deps, Session } from "@/lib/mcp/context7/types";

// Sample answers copied from the real Context7 service (shortened).
const LIBRARIES = `Available Libraries:

- Title: Zod
- Context7-compatible library ID: /colinhacks/zod
- Description: Zod is a TypeScript-first schema validation library.
- Code Snippets: 1900
- Source Reputation: High
----------
- Title: Zod
- Context7-compatible library ID: /websites/zod_dev
- Code Snippets: 1223
----------
- Title: Zod (Deepwiki)
- Context7-compatible library ID: /deepwiki/zod`;

const SNIPPETS = `### Define and parse schemas with Zod

Source: https://github.com/colinhacks/zod/blob/main/packages/docs/content/index.mdx

Defines an object schema and validates untrusted input.

\`\`\`ts
import * as z from "zod";
const User = z.object({ name: z.string() });
\`\`\`

--------------------------------

### schema.parse(data)

Source: https://github.com/colinhacks/zod/blob/main/packages/docs/content/basics.mdx

Validates input data against the schema.

--------------------------------

### A block with no source address

Just some text.`;

/** A fake connection that answers the two tools with the given texts. */
function fakeSession(answers: { resolve?: string; docs?: string } = {}) {
  const calls: { tool: string; args: Record<string, string> }[] = [];
  const close = vi.fn(async () => {});
  const session: Session = {
    call: async (tool, args) => {
      calls.push({ tool, args });
      return tool === "resolve-library-id"
        ? (answers.resolve ?? LIBRARIES)
        : (answers.docs ?? SNIPPETS);
    },
    close,
  };
  return { session, calls, close };
}
function deps(session: Session | (() => Promise<Session>)) {
  const onError = vi.fn();
  const open = typeof session === "function" ? session : async () => session;
  return { deps: { open, onError } satisfies Context7Deps, onError };
}

describe("parseLibraries", () => {
  it("reads the title and id of every library, best match first", () => {
    expect(parseLibraries(LIBRARIES)).toEqual([
      { id: "/colinhacks/zod", title: "Zod" },
      { id: "/websites/zod_dev", title: "Zod" },
      { id: "/deepwiki/zod", title: "Zod (Deepwiki)" },
    ]);
  });

  it("returns nothing for an answer without libraries", () => {
    expect(parseLibraries("No libraries found.")).toEqual([]);
    expect(parseLibraries("")).toEqual([]);
  });
});

describe("parseSnippets", () => {
  it("reads title, source address and the whole snippet", () => {
    const [first] = parseSnippets(SNIPPETS);
    expect(first.title).toBe("Define and parse schemas with Zod");
    expect(first.url).toBe(
      "https://github.com/colinhacks/zod/blob/main/packages/docs/content/index.mdx",
    );
    expect(first.markdown).toContain("const User = z.object");
  });

  it("drops a block without a source address, because it could not be cited", () => {
    const snippets = parseSnippets(SNIPPETS);
    expect(snippets).toHaveLength(2);
    expect(snippets.map((s) => s.title)).not.toContain(
      "A block with no source address",
    );
  });

  it("ignores a source that is not https", () => {
    expect(
      parseSnippets("### T\n\nSource: http://insecure.example/x\n\ntext"),
    ).toEqual([]);
  });

  it("cuts a very long snippet", () => {
    const long = `### T\n\nSource: https://a.dev/x\n\n${"word ".repeat(1000)}`;
    expect(parseSnippets(long)[0].markdown.length).toBeLessThanOrEqual(1800);
  });
});

describe("fetchSnippets", () => {
  const query = { library: "Zod", topic: "Installation: how to install" };

  it("asks which library it is, then asks that library for examples on the topic", async () => {
    const { session, calls } = fakeSession();
    const { deps: d } = deps(session);
    const snippets = await fetchSnippets(query, d);

    expect(calls).toEqual([
      {
        tool: "resolve-library-id",
        args: { libraryName: "Zod", query: query.topic },
      },
      {
        tool: "query-docs",
        args: { libraryId: "/colinhacks/zod", query: query.topic },
      },
    ]);
    expect(snippets).toHaveLength(2);
    expect(snippets[0].url).toMatch(/^https:\/\/github\.com/);
  });

  it("prefers a library whose title is exactly the name over the first one listed", async () => {
    const { session, calls } = fakeSession({
      resolve: `- Title: Zod Mini\n- Context7-compatible library ID: /a/mini\n----------\n- Title: zod\n- Context7-compatible library ID: /a/zod`,
    });
    await fetchSnippets(query, deps(session).deps);
    expect(calls[1].args.libraryId).toBe("/a/zod");
  });

  it("uses at most 4 snippets", async () => {
    const many = Array.from(
      { length: 9 },
      (_, i) => `### S${i}\n\nSource: https://a.dev/${i}\n\ntext`,
    ).join("\n\n--------------------------------\n\n");
    const { session } = fakeSession({ docs: many });
    expect(await fetchSnippets(query, deps(session).deps)).toHaveLength(4);
  });

  it("returns nothing, and asks no more, when the library is not found", async () => {
    const { session, calls } = fakeSession({ resolve: "No libraries found." });
    const { deps: d, onError } = deps(session);
    expect(await fetchSnippets(query, d)).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled(); // finding nothing is not an error
  });

  it("closes the connection when it is done", async () => {
    const { session, close } = fakeSession();
    await fetchSnippets(query, deps(session).deps);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("never throws: a failing tool call gives an empty list, a report, and a closed connection", async () => {
    const close = vi.fn(async () => {});
    const session: Session = {
      call: async () => {
        throw new Error("429 Too Many Requests");
      },
      close,
    };
    const { deps: d, onError } = deps(session);
    expect(await fetchSnippets(query, d)).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("never throws: if it cannot even connect, the answer is an empty list", async () => {
    const { deps: d, onError } = deps(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    expect(await fetchSnippets(query, d)).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("does not let a failure while closing hide the snippets", async () => {
    const { session } = fakeSession();
    session.close = async () => {
      throw new Error("already closed");
    };
    expect(await fetchSnippets(query, deps(session).deps)).toHaveLength(2);
  });

  it("gives up after the total time limit instead of waiting forever", async () => {
    vi.useFakeTimers();
    try {
      const never: Session = {
        call: () => new Promise(() => {}),
        close: async () => {},
      };
      const { deps: d, onError } = deps(never);
      const pending = fetchSnippets(query, d);
      await vi.advanceTimersByTimeAsync(21_000);
      expect(await pending).toEqual([]);
      expect(onError.mock.calls[0][0].message).toMatch(
        /longer than 20 seconds/,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

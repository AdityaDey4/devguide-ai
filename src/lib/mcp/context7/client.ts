import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serverSchema } from "../../env.schema";
import { ENDPOINT, REQUEST_TIMEOUT_MS } from "./config";
import type { Session } from "./types";

// The real connection to Context7 over MCP (Streamable HTTP). One connection serves both calls of
// a lookup, then it is closed. The key goes in a header, never in the address, and is read at call
// time so this works in the app, in scripts and in tests.

export class Context7Session implements Session {
  private constructor(private readonly client: Client) {}

  static async open(): Promise<Context7Session> {
    const key = serverSchema
      .pick({ CONTEXT7_API_KEY: true })
      .safeParse(process.env).data?.CONTEXT7_API_KEY;

    const client = new Client({ name: "devguide-ai", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
      requestInit: { headers: key ? { CONTEXT7_API_KEY: key } : {} },
    });
    await client.connect(transport, { timeout: REQUEST_TIMEOUT_MS });
    return new Context7Session(client);
  }

  /** Calls a Context7 tool and returns its text answer. Throws on an error answer. */
  call = async (
    tool: string,
    args: Record<string, string>,
  ): Promise<string> => {
    const result = await this.client.callTool(
      { name: tool, arguments: args },
      undefined,
      { timeout: REQUEST_TIMEOUT_MS },
    );
    const content = (result.content ?? []) as { type: string; text?: string }[];
    const text = content
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n");
    if (result.isError) {
      throw new Error(`Context7 ${tool} failed: ${text.slice(0, 200)}`);
    }
    return text;
  };

  close = () => this.client.close();
}

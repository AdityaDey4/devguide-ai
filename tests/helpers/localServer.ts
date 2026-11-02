import http from "node:http";
import type { Socket } from "node:net";

// A tiny HTTP server on this computer, so fetch tests need no internet.

export type LocalServer = {
  port: number;
  /** e.g. http://127.0.0.1:51234 */
  url: string;
  close: () => Promise<void>;
};

export async function startServer(
  handler: http.RequestListener,
): Promise<LocalServer> {
  const sockets = new Set<Socket>();
  const server = http.createServer(handler);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        sockets.forEach((socket) => socket.destroy()); // do not wait for open connections
        server.close(() => resolve());
      }),
  };
}

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

import type { ChatDeps } from "../deps";
import type { ChatStateType, ChatUpdate } from "../state";

// One of the two outside lookups (SRS FR-CHAT-6): code snippets from Context7 for what the stored
// text lacks.
//
//   state.grade.missing = "fs.writeFile"
//     -> { external: [{ type: "context7", title: "Write a file with fs.writeFile", url, markdown }] }
//
// Context7 never throws: if it is slow, down or finds nothing, the answer is an empty list and the
// chat goes on with what it has.

export async function context7(
  state: ChatStateType,
  deps: ChatDeps,
): Promise<ChatUpdate> {
  const topic = state.grade?.missing || state.standaloneQuery;
  const snippets = await deps.codeSnippets(state.technology.name, topic);

  return {
    external: snippets.map((snippet) => ({
      url: snippet.url,
      title: snippet.title,
      type: "context7" as const,
      markdown: snippet.markdown,
    })),
  };
}

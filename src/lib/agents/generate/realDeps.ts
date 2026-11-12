import { discoverDocs } from "../../fetch/discover";
import { fetchPage } from "../../fetch/fetchPage";
import { fetchSnippets } from "../../mcp/context7";
import { indexGuide } from "../../rag/guideIndex";
import { storeChunks, upsertTechnology } from "../../rag/store";
import { createServiceClient } from "../../supabase/service";
import { RunEvents } from "../shared/events";
import { askStructured, streamText } from "../shared/llm";
import { searchWeb } from "../shared/tavily";
import type { GenerateDeps } from "./deps";
import { saveGuide } from "./guide/saveGuide";

// The real dependencies of the generation graph: the database, the models, Tavily, the web.
// Server only. Kept apart from deps.ts so the node tests never import any of this.

export const realDeps: GenerateDeps = {
  events: (runId) => new RunEvents(runId),
  ask: (size, schema, messages) => askStructured(size, schema, messages),
  write: (messages, onToken) => streamText("large", messages, onToken),
  searchWeb: (query) => searchWeb(query),
  discoverDocs: (docsUrl) => discoverDocs(docsUrl),
  fetchPage: (url) => fetchPage(url),
  codeSnippets: (technologyName, topic) =>
    fetchSnippets({ library: technologyName, topic }),
  saveTechnology: (input) => upsertTechnology(createServiceClient(), input),
  saveGuide: (input) => saveGuide(createServiceClient(), input),
  indexGuide: (input) => indexGuide(input),
  storeChunks: (input) => storeChunks(input),
};

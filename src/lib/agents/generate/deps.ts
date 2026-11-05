import type { z } from "zod";
import type { BaseMessageLike } from "@langchain/core/messages";
import type { DiscoveryResult } from "../../fetch/discover";
import type { FetchedPage } from "../../fetch/fetchPage";
import type { StoreInput, StoreResult, TechnologyInput } from "../../rag/store";
import type { RunEvents } from "../shared/events";
import type { Snippet } from "../../mcp/context7";
import type { SavedGuide, SaveGuideInput } from "./guide/saveGuide";
import type { ModelSize } from "../shared/llm";
import type { SearchHit } from "../shared/tavily";

/** The part of RunEvents a node uses: save an event, stream text, save what is waiting. */
export type EventsPort = Pick<RunEvents, "emit" | "delta" | "flush">;

/**
 * Everything the nodes need from the outside world. The graph gets the real ones by default;
 * tests pass fakes, so no node ever needs a database, a model or the internet to be tested.
 */
export type GenerateDeps = {
  /** The progress feed of one run (the real one writes to `run_events`). */
  events: (runId: string) => EventsPort;
  /** Asks a model for an object that matches the schema. */
  ask: <S extends z.ZodType>(
    size: ModelSize,
    schema: S,
    messages: BaseMessageLike[],
  ) => Promise<z.infer<S>>;
  /** Asks the large model for text, calling `onToken` with each piece as it arrives. */
  write: (
    messages: BaseMessageLike[],
    onToken: (piece: string) => void | Promise<void>,
  ) => Promise<string>;
  searchWeb: (query: string) => Promise<SearchHit[]>;
  discoverDocs: (docsUrl: string) => Promise<DiscoveryResult>;
  fetchPage: (url: string) => Promise<FetchedPage>;
  /** Code snippets for a topic from Context7. Never fails: no snippets is an empty list. */
  codeSnippets: (technologyName: string, topic: string) => Promise<Snippet[]>;
  /** Makes sure the technology exists in the database and returns its id. */
  saveTechnology: (input: TechnologyInput) => Promise<string>;
  /** Saves the finished guide as a new version and returns the ids. */
  saveGuide: (input: SaveGuideInput) => Promise<SavedGuide>;
  /** Cuts nothing: takes finished chunks, embeds the new ones and saves them. */
  storeChunks: (input: StoreInput) => Promise<StoreResult>;
};

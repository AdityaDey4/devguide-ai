import {
  BookOpenIcon,
  CircleAlertIcon,
  DatabaseIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import type { ChatOrigin } from "@/lib/agents/chat";

// The small line under an answer that says where it came from (docs/04-UI-UX.md section 4.5,
// SRS FR-CHAT-8): the person can tell a guide answer from one just read live from the docs, and
// an answer that was not found from one that was.

const ORIGINS: Record<
  Exclude<ChatOrigin, "none">,
  { text: string; icon: LucideIcon; className: string }
> = {
  guide: {
    text: "From this guide",
    icon: BookOpenIcon,
    className: "text-muted-foreground",
  },
  stored_docs: {
    text: "From stored docs",
    icon: DatabaseIcon,
    className: "text-muted-foreground",
  },
  fetched_now: {
    text: "Fetched from the docs just now",
    icon: ZapIcon,
    className: "text-blue-600 dark:text-blue-400",
  },
  not_found: {
    text: "Not covered in the docs",
    icon: CircleAlertIcon,
    className: "text-amber-600 dark:text-amber-400",
  },
};

// A saved answer (lib/chat/cache) is said to be saved, and never "fetched just now": it was
// written earlier, even when the text it rests on was read live back then.
const SAVED: Partial<Record<ChatOrigin, string>> = {
  guide: "From this guide · saved answer",
  stored_docs: "From stored docs · saved answer",
  fetched_now: "From the docs · saved answer",
};

export function OriginLabel({
  origin,
  cached = false,
}: {
  origin: ChatOrigin;
  cached?: boolean;
}) {
  if (origin === "none") return null; // a greeting or a non-question has no source
  const shown = ORIGINS[origin];
  const saved = cached ? SAVED[origin] : undefined;
  const { icon: Icon } = shown;
  const text = saved ?? shown.text;
  const className = saved ? "text-muted-foreground" : shown.className;
  return (
    <p className={`flex items-center gap-1.5 text-xs font-medium ${className}`}>
      <Icon aria-hidden className="size-3.5" />
      {text}
    </p>
  );
}

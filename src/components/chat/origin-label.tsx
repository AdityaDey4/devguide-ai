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
  ChatOrigin,
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

export function OriginLabel({ origin }: { origin: ChatOrigin }) {
  const { text, icon: Icon, className } = ORIGINS[origin];
  return (
    <p className={`flex items-center gap-1.5 text-xs font-medium ${className}`}>
      <Icon aria-hidden className="size-3.5" />
      {text}
    </p>
  );
}

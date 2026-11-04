import type { BaseMessageLike } from "@langchain/core/messages";
import type { OutlineSection, SectionDraft, TechnologyInfo } from "../../state";
import { WRITER_RULES } from "../writeSection/prompt";

// What the rewriter is asked: the same rules and the same sources as the first draft, plus the
// draft itself and the list of problems the checker found.

export function buildRewriteMessages(
  technology: TechnologyInfo,
  section: OutlineSection,
  draft: SectionDraft,
): BaseMessageLike[] {
  const sources = draft.sources
    .map(
      (s) =>
        `=== SOURCE [${s.n}]: ${s.title} (${s.url}) ===\n${s.markdown}\n=== END SOURCE [${s.n}] ===`,
    )
    .join("\n\n");
  const problems = (draft.issues ?? []).map((issue) => `- ${issue}`).join("\n");

  return [
    { role: "system", content: WRITER_RULES },
    {
      role: "user",
      content: `Technology: ${technology.name}
Section: ${section.title}
What this section must do: ${section.goal}

Your previous draft of this section had problems. Write the whole section again and fix every one of them. Keep what was already correct.

Problems found:
${problems}

Previous draft:
${draft.markdown}

Reference material:

${sources}`,
    },
  ];
}

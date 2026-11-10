import Markdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";

// Shows guide Markdown safely (SRS SEC-6): raw HTML is never rendered (react-markdown escapes
// it) and rehype-sanitize strips anything unsafe, such as javascript: links. Citation markers
// were turned into links like [2](https://…) by lib/guide/citations.ts; a link whose text is
// only a number is drawn as a small raised number.

const components: Components = {
  a: ({ href, children }) => {
    const isCitation =
      typeof children === "string" && /^\d+$/.test(children.trim());
    const link = (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="text-primary underline underline-offset-2"
      >
        {children}
      </a>
    );
    // Brackets keep neighbours apart: [1][2], not "12".
    return isCitation ? <sup className="mx-px text-xs">[{link}]</sup> : link;
  },
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: ({ className, children }) => (
    <code
      className={
        className
          ? className
          : "bg-surface-2 rounded px-1 py-0.5 font-mono text-[0.9em]"
      }
    >
      {children}
    </code>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 mb-2 text-lg font-semibold">{children}</h3>
  ),
  h4: ({ children }) => <h4 className="mt-4 mb-1 font-semibold">{children}</h4>,
  p: ({ children }) => <p className="my-3 leading-7">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal pl-6">{children}</ol>,
  li: ({ children }) => <li className="my-1 leading-7">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="text-muted-foreground my-3 border-l-4 pl-4">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border px-3 py-1.5 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => <td className="border px-3 py-1.5">{children}</td>,
};

export function GuideMarkdown({ children }: { children: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={components}
    >
      {children}
    </Markdown>
  );
}

// Do the code examples only use names that appear in the sources? (FR-GEN-7)
//
//   missingNames("import { z } from 'zod';\nz.fakeMethod();", "…z.object… zod… z…")
//     -> ["fakeMethod"]
//
// A model can invent a plausible package or function. For every code block we collect the
// packages (import / require / npm install), the imported names, and the functions and methods
// that are called, and check each appears somewhere in the source text. Names the example defines
// itself (function, const, class, def) and ordinary language built-ins are not checked.
// This is a heuristic: it catches inventions, it does not prove the code runs.

const FENCED_CODE = /```[^\n]*\n([\s\S]*?)```/g;

const BUILT_IN = new Set(
  (
    "if for while switch catch function return typeof new await async import require export default " +
    "console log error warn info debug table Promise resolve reject then finally all race " +
    "Array Object JSON Math String Number Boolean Error Date Map Set RegExp Symbol BigInt " +
    "parseInt parseFloat isNaN setTimeout setInterval clearTimeout fetch URL Buffer process " +
    "map filter reduce forEach find some every push pop shift unshift slice splice join split " +
    "includes indexOf keys values entries assign freeze from of isArray stringify parse toString " +
    "test exec match replace trim startsWith endsWith padStart toISOString toLowerCase toUpperCase " +
    "print len range str int float list dict tuple open super isinstance type sum min max sorted " +
    "enumerate zip input format append get set add has delete clear next json text status send " +
    "describe it expect run main"
  ).split(" "),
);

const NODE_BUILT_IN_MODULES = new Set(
  "fs path http https os crypto util stream url events assert child_process zlib readline buffer".split(
    " ",
  ),
);

export function codeBlocks(markdown: string): string[] {
  return [...markdown.matchAll(FENCED_CODE)].map((match) => match[1]);
}

/** Names used in the code of this markdown that the sources never mention. */
export function missingNames(markdown: string, sourceText: string): string[] {
  const missing = new Set<string>();
  for (const code of codeBlocks(markdown)) {
    for (const name of namesIn(code)) {
      if (!sourceText.includes(name)) missing.add(name);
    }
  }
  return [...missing];
}

function namesIn(code: string): Set<string> {
  const own = definedIn(code);
  const names = new Set<string>();

  for (const spec of packagesIn(code)) names.add(spec);
  for (const list of code.matchAll(/\bimport\s*\{([^}]+)\}\s*from/g)) {
    for (const part of list[1].split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();
      if (name) names.add(name);
    }
  }
  for (const match of code.matchAll(/(?<![\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    names.add(match[1]);
  }
  for (const match of code.matchAll(/\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    names.add(match[1]);
  }

  return new Set(
    [...names].filter((name) => !BUILT_IN.has(name) && !own.has(name)),
  );
}

/** The packages a snippet uses: imports, requires, and install commands. */
function packagesIn(code: string): string[] {
  const specs: string[] = [];
  const patterns: [RegExp, number][] = [
    [/\bfrom\s+['"]([^'"\n]+)['"]/g, 1],
    [/\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g, 1],
    [
      /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|i)\s+(?:-[\w-]+\s+)*([@\w][\w@/.-]*)/g,
      1,
    ],
    [/\bpip3?\s+install\s+(?:-[\w-]+\s+)*(\w[\w.-]*)/g, 1],
  ];
  for (const [pattern, group] of patterns) {
    for (const match of code.matchAll(pattern)) specs.push(match[group]);
  }

  return specs
    .filter((spec) => !/^[./]/.test(spec) && !spec.startsWith("node:"))
    .map(packageName)
    .filter((name) => !NODE_BUILT_IN_MODULES.has(name));
}

/** "zod/v4" -> "zod", "@langchain/core/messages" -> "@langchain/core", "zod@latest" -> "zod". */
function packageName(spec: string): string {
  const parts = spec.split("/");
  const name = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  return name.replace(/(?<=.)@.*$/, "");
}

/** Names the example creates itself, so they cannot be "missing from the sources". */
function definedIn(code: string): Set<string> {
  const own = new Set<string>();
  const patterns = [
    /\b(?:function|def|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:const|let|var)\s*\{([^}]+)\}/g,
    /(?<![\w$.])([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function\b)/g,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      for (const name of match[1].split(",")) {
        own.add(name.split(":").pop()!.trim());
      }
    }
  }
  return own;
}

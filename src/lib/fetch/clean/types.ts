/** A fetched page, as returned by fetchPage(). */
export type CleanInput = {
  /** The raw response body (HTML, Markdown or plain text). */
  body: string;
  /** Final URL of the page. Relative links are resolved against it. */
  url: string;
  /** Media type such as "text/html" or "text/markdown". */
  contentType: string;
};

/** Which part of the page the text was taken from. */
export type ContentMethod = "main" | "readability" | "body";

export type CleanedPage = {
  title: string;
  /** Clean Markdown: headings, text, lists, tables and fenced code blocks. */
  markdown: string;
  /** "plain" means the page was already Markdown or text and was only tidied. */
  method: ContentMethod | "plain";
};

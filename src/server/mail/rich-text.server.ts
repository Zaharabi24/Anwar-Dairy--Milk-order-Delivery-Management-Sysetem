// Formatted Mailbox messages: what the editor sends, cut down to what an email may carry.
//
// The editor is a contenteditable box, so what arrives is whatever the browser chose to write:
// <div>s for lines, <b> or <strong>, <span style=...> from a paste, a stray <o:p> from Word. None
// of it is trusted. `cleanMailHtml` rebuilds the message from the text and a short list of tags --
// it never passes a tag or an attribute through as written -- so the result can only ever contain
// markup this file emitted. That is the same promise the plain-text renderer makes with its
// `**bold**`, extended to a few more kinds of emphasis.
import { BRAND, escapeHtml } from "../auth/mail.server";

/** The tags a message can keep, and what each is written as. Anything else keeps only its text. */
const KEEP: Record<string, string> = {
  b: "strong",
  strong: "strong",
  i: "em",
  em: "em",
  u: "u",
  p: "p",
  div: "p",
  h1: "p",
  h2: "p",
  h3: "p",
  h4: "p",
  h5: "p",
  h6: "p",
  blockquote: "p",
  ul: "ul",
  ol: "ol",
  li: "li",
  a: "a",
  br: "br",
};

/** Blocks a paragraph cannot contain; opening one closes the paragraph first, as a browser would. */
const BLOCKS = new Set(["p", "ul", "ol"]);

/** Elements whose contents are not text anybody typed, and go altogether. */
const DROP_WITH_CONTENT = /<(script|style|head|title|xml|template|noscript)\b[\s\S]*?<\/\1\s*>/gi;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Text as the browser serialised it, back to characters, so it can be escaped exactly once. */
function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Only web and mail links. `javascript:` and friends are not links, they are programs. */
function safeHref(attrs: string): string | null {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  const raw = decode((match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim());
  return /^(https?:\/\/|mailto:)/i.test(raw) ? raw : null;
}

/**
 * The message, rebuilt from the tags on the list above.
 *
 * Tags are balanced as they go: a closing tag with no matching opener is ignored, one that skips
 * over others closes those too, and whatever is still open at the end is closed. A list item
 * outside a list becomes a paragraph. The output is canonical -- no attributes except a checked
 * href -- which is what lets the renderer style it by plain string replacement.
 */
export function cleanMailHtml(input: string): string {
  const source = input.replace(/<!--[\s\S]*?-->/g, "").replace(DROP_WITH_CONTENT, "");
  const out: string[] = [];
  const open: string[] = [];

  const close = (tag: string) => {
    const at = open.lastIndexOf(tag);
    if (at === -1) return;
    while (open.length > at) out.push(`</${open.pop()}>`);
  };

  /** Loose words at the top level go in a paragraph, so they get a paragraph's spacing. */
  const inBlock = () => open.some((t) => t === "p" || t === "li");
  const ensureBlock = () => {
    if (inBlock()) return;
    out.push("<p>");
    open.push("p");
  };
  const text = (raw: string) => {
    const value = decode(raw);
    if (!value.trim()) {
      if (inBlock()) out.push(escapeHtml(value));
      return;
    }
    ensureBlock();
    out.push(escapeHtml(value));
  };

  const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/g;
  let last = 0;
  for (let m = tagPattern.exec(source); m; m = tagPattern.exec(source)) {
    text(source.slice(last, m.index));
    last = m.index + m[0].length;

    const closing = m[1] === "/";
    let tag = KEEP[m[2]!.toLowerCase()];
    if (!tag) continue;
    if (tag === "li" && !open.includes("ul") && !open.includes("ol")) tag = "p";

    if (closing) {
      if (tag !== "br") close(tag);
      continue;
    }
    if (tag === "br") {
      ensureBlock();
      out.push("<br>");
      continue;
    }
    if (BLOCKS.has(tag) && open.includes("p")) close("p");
    if (!BLOCKS.has(tag) && tag !== "li") ensureBlock();
    if (tag === "li") {
      // A new item ends the one before it, when the browser didn't say so.
      const list = Math.max(open.lastIndexOf("ul"), open.lastIndexOf("ol"));
      const item = open.lastIndexOf("li");
      if (item > list) close("li");
    }
    if (tag === "a") {
      const href = safeHref(m[3] ?? "");
      if (!href) continue;
      if (open.includes("a")) close("a");
      out.push(`<a href="${escapeHtml(href)}">`);
      open.push("a");
      continue;
    }
    out.push(`<${tag}>`);
    open.push(tag);
  }
  text(source.slice(last));
  while (open.length) out.push(`</${open.pop()}>`);

  return out
    .join("")
    // Empty wrappers, including the <p></p> Chrome leaves around a list. A blank line typed on
    // purpose is <p><br></p> and stays.
    .replace(/<(strong|em|u|a|p)(?: href="[^"]*")?><\/\1>/g, "")
    .trim();
}

/** Whether a cleaned message says anything at all once the tags are set aside. */
export function hasMailText(clean: string): boolean {
  // trim() already counts a non-breaking space as space.
  return decode(clean.replace(/<[^>]*>/g, "")).trim().length > 0;
}

/**
 * A cleaned message, styled for mail clients. Inline styles, because most clients ignore a
 * stylesheet, and the same paragraph spacing the plain-text messages have always had.
 */
export function renderMailHtml(clean: string): string {
  return clean
    .replace(/<p>/g, '<p style="margin:0 0 16px;">')
    .replace(/<ul>/g, '<ul style="margin:0 0 16px;padding-left:24px;">')
    .replace(/<ol>/g, '<ol style="margin:0 0 16px;padding-left:24px;">')
    .replace(/<li>/g, '<li style="margin:0 0 4px;">')
    .replace(/<a href="/g, `<a style="color:${BRAND};text-decoration:underline;" href="`);
}

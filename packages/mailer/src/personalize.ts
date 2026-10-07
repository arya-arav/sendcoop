// Per-recipient content: merge tags like {{first_name}} or
// {{first_name | there}} (with a fallback), and spintax like
// {Hi|Hello|Hey} (one option picked per recipient, nesting allowed).
//
// Tags are swapped for placeholders before spintax runs, so a "|" in a
// fallback or a brace in someone's data is never read as spintax. Spintax
// skips <style>, <script> and comments in HTML, where braces are CSS or code.

export type MergeValues = Record<string, string | number | null | undefined>;

const TAG = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/g;
const SPIN = /\{([^{}]*\|[^{}]*)\}/;
const RAW_BLOCKS = /(<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<!--[\s\S]*?-->)/gi;
const MARK = String.fromCharCode(0);
const PLACEHOLDER = new RegExp(`${MARK}(\\d+)${MARK}`, "g");

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const unquote = (value: string) => value.replace(/^(["'])(.*)\1$/, "$2");

/** A repeatable random sequence from a string, so a retried email reads the same. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function spin(text: string, random: () => number) {
  let out = text;
  // Innermost groups first, so nested spintax works.
  for (let match = SPIN.exec(out); match; match = SPIN.exec(out)) {
    const options = match[1]!.split("|");
    const pick = options[Math.floor(random() * options.length)] ?? "";
    out = out.slice(0, match.index) + pick + out.slice(match.index + match[0].length);
  }
  return out;
}

export type RenderOptions = {
  /** Escape subscriber data for HTML. Fallbacks are the author's own markup and stay as written. */
  html?: boolean;
  /** Tags left as they are, for a later step (e.g. unsubscribe_url). */
  keep?: string[];
  /** Picks spintax options; leave out to keep spintax as written. */
  random?: () => number;
};

export function renderContent(template: string, values: MergeValues, options: RenderOptions = {}) {
  const { html = false, keep = [], random } = options;
  const filled: string[] = [];
  const marked = template.replace(TAG, (whole, rawName: string, fallback?: string) => {
    const name = rawName.toLowerCase();
    let text: string;
    if (keep.includes(name)) {
      text = whole;
    } else {
      const value = values[name];
      const empty = value === null || value === undefined || String(value).trim() === "";
      text = empty ? unquote(fallback ?? "") : html ? escapeHtml(String(value)) : String(value);
    }
    filled.push(text);
    return `${MARK}${filled.length - 1}${MARK}`;
  });

  let spun = marked;
  if (random) {
    spun = html
      ? marked
          .split(RAW_BLOCKS)
          .map((part, i) => (i % 2 === 1 ? part : spin(part, random)))
          .join("")
      : spin(marked, random);
  }
  return spun.replace(PLACEHOLDER, (_, i: string) => filled[Number(i)] ?? "");
}

export type Subscriber = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  fields: Record<string, unknown> | null;
};

/** The merge tags available for a subscriber: built-ins plus custom fields by key. */
export function mergeValuesFor(subscriber: Subscriber): MergeValues {
  const fields = Object.entries(subscriber.fields ?? {}).filter(
    (entry): entry is [string, string | number] =>
      typeof entry[1] === "string" || typeof entry[1] === "number",
  );
  return {
    ...Object.fromEntries(fields),
    email: subscriber.email,
    first_name: subscriber.firstName,
    last_name: subscriber.lastName,
    full_name: [subscriber.firstName, subscriber.lastName].filter(Boolean).join(" "),
  };
}

/**
 * Personalizes a campaign's subject and bodies for one recipient. The same
 * seed (the message id) always gives the same spintax choices.
 */
export function personalize(
  content: { subject: string; html: string; text: string },
  values: MergeValues,
  seed: string,
) {
  const keep = ["unsubscribe_url"];
  return {
    subject: renderContent(content.subject, values, { random: seededRandom(`${seed}:subject`) }),
    html: renderContent(content.html, values, {
      html: true,
      keep,
      random: seededRandom(`${seed}:html`),
    }),
    text: renderContent(content.text, values, { keep, random: seededRandom(`${seed}:text`) }),
  };
}

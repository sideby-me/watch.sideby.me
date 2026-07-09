// Lightweight chat markdown tokenizer supporting a constrained subset
// * / _ italic, ** bold, *** bold+italic, __ underline, __** underline+bold, __*** underline+bold+italic, ~~ strike
// * Inline code `code` and masked links [label](https://...). Autolinks handled separately in renderer
// We treat underline distinctly from bold so we can't rely on standard Markdown libs

export type TextNode = { type: 'text'; value: string };
export type CodeNode = { type: 'code'; value: string };
export type GenericNode = {
  type: 'italic' | 'bold' | 'underline' | 'strike' | 'bolditalic' | 'spoiler';
  children: Node[];
};
export type LinkNode = { type: 'link'; href: string; children: Node[] };
export type Node = TextNode | CodeNode | GenericNode | LinkNode;

interface StackEntry {
  marker: string;
  node: GenericNode;
}

// Public regex to cheaply detect if parsing needed
export const CHAT_MARKDOWN_PATTERN = /[`*_~\[|]|https?:\/\//;

// Internal helpers
function markerToType(run: string): GenericNode['type'] | null {
  switch (run) {
    case '*':
    case '_':
      return 'italic';
    case '**':
      return 'bold';
    case '***':
      return 'bolditalic';
    case '__':
      return 'underline';
    case '~~':
      return 'strike';
    case '||':
      return 'spoiler';
    default:
      return null;
  }
}

function isSafeUrl(href: string): boolean {
  return /^(https?:)\/\//i.test(href);
}

// Tokenize a chat message into an inline AST
export function parseChatMarkdown(input: string): Node[] {
  const root: GenericNode = { type: 'italic', children: [] };
  const stack: StackEntry[] = [{ marker: 'ROOT', node: root }];
  let buffer = '';
  const top = () => stack[stack.length - 1].node;
  const flushText = () => {
    if (buffer) {
      top().children.push({ type: 'text', value: buffer });
      buffer = '';
    }
  };
  const pushNode = (marker: string, nodeType: GenericNode['type']) => {
    const node: GenericNode = { type: nodeType, children: [] };
    top().children.push(node);
    stack.push({ marker, node });
  };
  const closeIfMatch = (marker: string): boolean => {
    const current = stack[stack.length - 1];
    if (current.marker === marker) {
      flushText();
      stack.pop();
      return true;
    }
    return false;
  };

  let i = 0;
  const len = input.length;
  while (i < len) {
    const ch = input[i];

    // Inline code
    if (ch === '`') {
      flushText();
      let j = i + 1;
      while (j < len && input[j] !== '`') j++;
      if (j < len) {
        top().children.push({ type: 'code', value: input.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
      buffer += ch;
      i++;
      continue;
    }

    // Masked link [label](url)
    if (ch === '[') {
      const closeBracket = input.indexOf(']', i + 1);
      if (closeBracket !== -1 && input[closeBracket + 1] === '(') {
        const closeParen = input.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          const label = input.slice(i + 1, closeBracket);
          const href = input.slice(closeBracket + 2, closeParen).trim();
          if (isSafeUrl(href)) {
            flushText();
            const children = parseChatMarkdown(label);
            top().children.push({ type: 'link', href, children });
            i = closeParen + 1;
            continue;
          }
        }
      }
      buffer += ch; // literal fallback
      i++;
      continue;
    }

    // Marker runs *, _, ~, |
    if (ch === '*' || ch === '_' || ch === '~' || ch === '|') {
      const runChar = ch;
      let j = i;
      while (j < len && input[j] === runChar && j - i < 3) j++;
      const run = input.slice(i, j);
      const markerType = markerToType(run);
      if (markerType) {
        if (closeIfMatch(run)) {
          i = j;
          continue;
        }
        flushText();
        pushNode(run, markerType);
        i = j;
        continue;
      }
      buffer += run;
      i = j;
      continue;
    }

    buffer += ch;
    i++;
  }

  flushText();

  // Dissolve any unclosed markers: the marker becomes literal text and the node's
  // children are lifted into its parent, so formatting that *did* close still renders.
  // Innermost first, since dissolving a node moves its children up one level.
  // An unclosed node is always its parent's last child — nothing is appended to the
  // parent between the push and the (never reached) pop.
  for (let s = stack.length - 1; s >= 1; s--) {
    const { marker, node } = stack[s];
    const parent = stack[s - 1].node;
    parent.children.pop();
    parent.children.push({ type: 'text', value: marker }, ...node.children);
  }
  return root.children;
}

// Utility for autolink splitting
export const AUTO_LINK_REGEX = /https?:\/\/[^\s<>()]+/g;

export function trimAutolink(url: string): { href: string; display: string } {
  const match = url.match(/^(.*?)([).,!?:]*$)/);
  if (!match) return { href: url, display: url };
  return { href: match[1], display: match[1] };
}

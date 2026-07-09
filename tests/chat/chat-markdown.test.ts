import { describe, it, expect } from 'vitest';
import { parseChatMarkdown, type Node } from '@/src/lib/chat-markdown';

// The text a user would actually see rendered, ignoring formatting.
function visibleText(nodes: Node[]): string {
  return nodes
    .map(n => {
      switch (n.type) {
        case 'text':
          return n.value;
        case 'code':
          return '`' + n.value + '`';
        default:
          return visibleText(n.children);
      }
    })
    .join('');
}

const ALL_MARKERS = ['*', '_', '**', '***', '__', '~~', '||'] as const;

describe('parseChatMarkdown — unmatched markers survive as literal text', () => {
  it.each(ALL_MARKERS)('a trailing %s is preserved', marker => {
    expect(visibleText(parseChatMarkdown(`hi ${marker}`))).toBe(`hi ${marker}`);
  });

  it.each(ALL_MARKERS)('an unclosed %s mid-message is preserved', marker => {
    expect(visibleText(parseChatMarkdown(`hello ${marker}world`))).toBe(`hello ${marker}world`);
  });

  it.each(ALL_MARKERS)('a message of only %s is preserved', marker => {
    expect(visibleText(parseChatMarkdown(marker))).toBe(marker);
  });

  it('an unmatched marker produces no formatting node', () => {
    expect(parseChatMarkdown('hi *')).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'text', value: '*' },
    ]);
  });

  it('does not italicize text after an unclosed non-italic marker', () => {
    expect(parseChatMarkdown('a ~~b')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'text', value: '~~' },
      { type: 'text', value: 'b' },
    ]);
  });

  it('keeps valid nested formatting when an outer marker is unclosed', () => {
    expect(parseChatMarkdown('*a **b** c')).toEqual([
      { type: 'text', value: '*' },
      { type: 'text', value: 'a ' },
      { type: 'bold', children: [{ type: 'text', value: 'b' }] },
      { type: 'text', value: ' c' },
    ]);
  });

  it('handles several nested unclosed markers', () => {
    expect(visibleText(parseChatMarkdown('**a *b'))).toBe('**a *b');
  });

  it('preserves an unclosed marker wrapping a code span and a link', () => {
    expect(visibleText(parseChatMarkdown('*`x` [l](https://e.com)'))).toBe('*`x` l');
  });
});

describe('parseChatMarkdown — valid formatting still parses', () => {
  it('parses each supported marker', () => {
    expect(parseChatMarkdown('*i*')).toEqual([{ type: 'italic', children: [{ type: 'text', value: 'i' }] }]);
    expect(parseChatMarkdown('_i_')).toEqual([{ type: 'italic', children: [{ type: 'text', value: 'i' }] }]);
    expect(parseChatMarkdown('**b**')).toEqual([{ type: 'bold', children: [{ type: 'text', value: 'b' }] }]);
    expect(parseChatMarkdown('***bi***')).toEqual([{ type: 'bolditalic', children: [{ type: 'text', value: 'bi' }] }]);
    expect(parseChatMarkdown('__u__')).toEqual([{ type: 'underline', children: [{ type: 'text', value: 'u' }] }]);
    expect(parseChatMarkdown('~~s~~')).toEqual([{ type: 'strike', children: [{ type: 'text', value: 's' }] }]);
    expect(parseChatMarkdown('||sp||')).toEqual([{ type: 'spoiler', children: [{ type: 'text', value: 'sp' }] }]);
  });

  it('parses nested underline + bold', () => {
    expect(parseChatMarkdown('__**ub**__')).toEqual([
      { type: 'underline', children: [{ type: 'bold', children: [{ type: 'text', value: 'ub' }] }] },
    ]);
  });

  it('parses inline code and masked links', () => {
    expect(parseChatMarkdown('`c`')).toEqual([{ type: 'code', value: 'c' }]);
    expect(parseChatMarkdown('[l](https://e.com)')).toEqual([
      { type: 'link', href: 'https://e.com', children: [{ type: 'text', value: 'l' }] },
    ]);
  });

  it('rejects unsafe link protocols, falling back to literal text', () => {
    expect(visibleText(parseChatMarkdown('[l](javascript:alert(1))'))).toBe('[l](javascript:alert(1))');
  });

  it('parses a mix of markers in one message', () => {
    expect(parseChatMarkdown('a **b** and ~~c~~')).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'bold', children: [{ type: 'text', value: 'b' }] },
      { type: 'text', value: ' and ' },
      { type: 'strike', children: [{ type: 'text', value: 'c' }] },
    ]);
  });

  it('parses formatting that closes before trailing text', () => {
    expect(parseChatMarkdown('x *y* z')).toEqual([
      { type: 'text', value: 'x ' },
      { type: 'italic', children: [{ type: 'text', value: 'y' }] },
      { type: 'text', value: ' z' },
    ]);
  });
});

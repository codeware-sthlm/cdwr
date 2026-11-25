import { render } from '@testing-library/react';

import { InlineText } from './InlineText';

const html = (text: string) =>
  render(
    <p>
      <InlineText text={text} />
    </p>
  ).container.innerHTML.replace(/ class="[^"]*"/g, '');

describe('InlineText', () => {
  it.each([
    ['plain text', '<p>plain text</p>'],
    ['the `cms` app', '<p>the <code>cms</code> app</p>'],
    [
      '`cdwr.io` and `codeware.se`',
      '<p><code>cdwr.io</code> and <code>codeware.se</code></p>'
    ],
    ['a lone ` stays', '<p>a lone ` stays</p>'],
    ['empty `` pair', '<p>empty `` pair</p>']
  ])('draws %j', (text, expected) => {
    expect(html(text)).toBe(expected);
  });
});

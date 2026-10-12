import type { EmailAdapter } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { escape, renderEmailLayout } from './templates/layout';
import { htmlToText, withTextPart } from './with-text-part';

const payload = {} as Parameters<EmailAdapter>[0]['payload'];

const fakeAdapter =
  (sendEmail: EmailAdapter['sendEmail']): EmailAdapter =>
  () => ({
    name: 'fake',
    defaultFromAddress: 'no-reply@codeware.se',
    defaultFromName: 'Codeware',
    sendEmail
  });

const send = async (message: Parameters<EmailAdapter['sendEmail']>[0]) => {
  const sendEmail = vi.fn().mockResolvedValue({ id: 'sent' });
  const factory = await Promise.resolve(withTextPart(fakeAdapter(sendEmail)));
  await factory({ payload }).sendEmail(message);
  return sendEmail.mock.calls[0][0];
};

describe('htmlToText', () => {
  it('leaves no script or style behind nested input', () => {
    const script = htmlToText('<scr<script>x</script>ipt>alert(1)</script>');
    const style = htmlToText('<sty<style>a</style>le>b</style>');

    expect(script).not.toMatch(/<script/i);
    expect(style).not.toMatch(/<style/i);
  });

  it('keeps the reset url once when the button is skipped', () => {
    const url = 'https://titan.example/reset?token=abc';
    const { html } = renderEmailLayout({
      title: 'Reset',
      paragraphs: ['Reset your password.'],
      from: 'Titan',
      cta: { label: 'Reset password', url }
    });
    const text = htmlToText(html);

    expect(text.split(url)).toHaveLength(2);
    expect(text).not.toContain('text:skip');
  });

  it('turns block ends into line breaks', () => {
    expect(
      htmlToText('<h1>Title</h1><p>One</p><p>Two<br>three</p><div>Four</div>')
    ).toBe('Title\nOne\nTwo\nthree\nFour');
  });

  it('writes a link as label and url', () => {
    expect(htmlToText('<a href="https://a.se/x">Open</a>')).toBe(
      'Open: https://a.se/x'
    );
  });

  it('writes just the url when the label is the url', () => {
    expect(htmlToText('<a href="https://a.se/x">https://a.se/x</a>')).toBe(
      'https://a.se/x'
    );
  });

  it('decodes what escape encodes, once', () => {
    const value = `<b> & "x" &lt;`;
    expect(htmlToText(`<p>${escape(value)}</p>`)).toBe(value);
  });

  it('ignores the head and collapses blank runs', () => {
    expect(
      htmlToText(
        '<html><head><title>Hidden</title></head><body><p>A</p><p></p><p></p><p>B</p></body></html>'
      )
    ).toBe('A\n\nB');
  });
});

describe('withTextPart', () => {
  it('derives a text part from html', async () => {
    const sent = await send({
      to: 'a@b.se',
      subject: 's',
      html: '<p>Hello</p>'
    });

    expect(sent.text).toBe('Hello');
    expect(sent.html).toBe('<p>Hello</p>');
  });

  it('keeps a text part that is already there', async () => {
    const message = { to: 'a@b.se', subject: 's', html: '<p>H</p>', text: 'T' };

    expect(await send(message)).toBe(message);
  });

  it('leaves a message without html alone', async () => {
    const message = { to: 'a@b.se', subject: 's' };

    expect(await send(message)).toBe(message);
  });
});

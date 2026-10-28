import { afterEach, describe, expect, it } from 'vitest';

import { loadTurnstile, pageNonce } from './turnstile';

describe('pageNonce', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('reads the nonce of a script the server nonced', () => {
    const nonced = document.createElement('script');
    nonced.nonce = 'abc123';
    nonced.setAttribute('nonce', 'abc123');
    document.head.appendChild(nonced);
    expect(pageNonce()).toBe('abc123');
  });

  it('is undefined on a page without a nonce', () => {
    expect(pageNonce()).toBeUndefined();
  });
});

describe('loadTurnstile', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('gives the widget script the page nonce', () => {
    const nonced = document.createElement('script');
    nonced.nonce = 'abc123';
    nonced.setAttribute('nonce', 'abc123');
    document.head.appendChild(nonced);

    void loadTurnstile();
    const added = document.head.querySelector<HTMLScriptElement>(
      'script[src*="challenges.cloudflare.com"]'
    );
    expect(added?.nonce).toBe('abc123');
  });
});

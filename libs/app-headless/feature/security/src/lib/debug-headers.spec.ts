import { logRequestHeaders, logResponseHeaders } from './debug-headers';

const printed = (spy: ReturnType<typeof vi.spyOn>): string =>
  spy.mock.calls.map((call) => call.join(' ')).join('\n');

describe('debug headers', () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    log.mockRestore();
  });

  it('redacts a credential header', () => {
    logRequestHeaders(
      new Request('https://site.example/page', {
        headers: { authorization: 'Bearer s3cret', 'x-api-key': 'k3y' }
      })
    );

    const output = printed(log);
    expect(output).not.toContain('s3cret');
    expect(output).not.toContain('k3y');
    expect(output).toContain('[redacted]');
  });

  it('redacts a visitor address header', () => {
    logRequestHeaders(
      new Request('https://site.example/page', {
        headers: {
          'fly-client-ip': '203.0.113.7',
          'x-forwarded-for': '198.51.100.9'
        }
      })
    );

    const output = printed(log);
    expect(output).not.toContain('203.0.113.7');
    expect(output).not.toContain('198.51.100.9');
  });

  it('keeps a header that is neither', () => {
    logResponseHeaders(
      new Response(null, { headers: { 'content-type': 'text/html' } })
    );

    expect(printed(log)).toContain('text/html');
  });

  it('prints the url without its query string or hash', () => {
    logRequestHeaders(new Request('https://site.example/page?token=abc#frag'));

    const output = printed(log);
    expect(output).toContain('GET https://site.example/page');
    expect(output).not.toContain('token=abc');
    expect(output).not.toContain('frag');
  });

  it('strips the query from url headers', () => {
    logRequestHeaders(
      new Request('https://site.example/page', {
        headers: { referer: 'https://site.example/from?token=abc' }
      })
    );

    const output = printed(log);
    expect(output).toContain('https://site.example/from');
    expect(output).not.toContain('token=abc');
  });
});

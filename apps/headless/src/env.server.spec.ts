import { describeEnvIssues, exitOnInvalidEnv } from './env.server';

const valid = {
  PAYLOAD_URL: 'http://localhost:3000',
  PAYLOAD_API_KEY: 'tenant-key',
  SIGNATURE_SECRET: 'signing-secret',
  TENANT_ID: 'moon'
};

describe('describeEnvIssues', () => {
  it('finds nothing in a complete environment', () => {
    expect(describeEnvIssues(valid)).toEqual([]);
  });

  it('names each missing variable', () => {
    const { PAYLOAD_URL: _url, SIGNATURE_SECRET: _secret, ...rest } = valid;
    const issues = describeEnvIssues(rest);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatch(/^PAYLOAD_URL: /);
    expect(issues[1]).toMatch(/^SIGNATURE_SECRET: /);
  });

  it('never prints a value', () => {
    const issues = describeEnvIssues({
      ...valid,
      PAYLOAD_URL: 'leaked-url',
      SITE_GATE_PASSWORD: 'short',
      DEPLOY_ENV: 'leaked-env'
    });
    expect(issues).toHaveLength(3);
    expect(issues.join('\n')).not.toMatch(/leaked|short/);
  });
});

describe('exitOnInvalidEnv', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('carries on with a complete environment', () => {
    const exit = vi.fn();
    exitOnInvalidEnv(valid, exit);
    expect(exit).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('exits non-zero, naming what is invalid', () => {
    const exit = vi.fn();
    const { SIGNATURE_SECRET: _secret, ...rest } = valid;
    exitOnInvalidEnv(rest, exit);
    expect(exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('SIGNATURE_SECRET:')
    );
  });
});

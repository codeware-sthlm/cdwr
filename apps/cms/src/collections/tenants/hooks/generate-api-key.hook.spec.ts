import { generateApiKeyHook } from './generate-api-key.hook';

type HookArgs = Parameters<typeof generateApiKeyHook>[0];

const run = (operation: HookArgs['operation'], data: Record<string, unknown>) =>
  generateApiKeyHook({
    args: { data },
    operation
  } as unknown as HookArgs) as { data: Record<string, unknown> };

describe('generateApiKeyHook', () => {
  it('generates a key for a workspace created without one', () => {
    const { data } = run('create', { name: 'Codeware' });

    expect(data.apiKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(data.enableAPIKey).toBe(true);
  });

  it('keeps a key given at creation', () => {
    const { data } = run('create', { apiKey: 'given' });

    expect(data.apiKey).toBe('given');
  });

  it('leaves other operations alone', () => {
    const { data } = run('update', { name: 'Codeware' });

    expect(data.apiKey).toBeUndefined();
  });
});

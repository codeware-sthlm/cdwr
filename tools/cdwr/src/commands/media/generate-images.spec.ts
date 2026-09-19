import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

import command, { tierOf } from './generate-images';

vi.mock('../../services/infisical', () => ({
  readSecret: vi.fn().mockResolvedValue('token')
}));

vi.mock('../../services/replicate', () => ({
  createPrediction: vi.fn().mockResolvedValue({ id: 'p1', status: 'starting' }),
  pollPrediction: vi.fn().mockResolvedValue({
    id: 'p1',
    status: 'succeeded',
    output: ['https://img.example/hero.jpg']
  }),
  downloadOutput: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
}));

vi.stubGlobal('fetch', vi.fn());

describe('tierOf', () => {
  it('is the part after the last slash', () => {
    expect(tierOf('google/nano-banana-2')).toBe('nano-banana-2');
    expect(tierOf('black-forest-labs/flux-1.1-pro-ultra')).toBe(
      'flux-1.1-pro-ultra'
    );
  });

  it('falls back to the whole string without a slash', () => {
    expect(tierOf('standalone')).toBe('standalone');
  });
});

describe('media generate-images', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cdwr-media-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('generates the selected shots and writes them under .showcase-images', async () => {
    const ui = fakeUi([], false);
    const stdout: string[] = [];
    const exit = await runCommand({
      name: 'media generate-images',
      command,
      argv: [
        '--shots',
        'hero',
        '--model',
        'google/nano-banana-2',
        '--yes',
        '--json'
      ],
      root,
      env: { INFISICAL_PROJECT_ID: 'x', INFISICAL_SERVICE_TOKEN: 'y' },
      prefs: memoryPrefs(),
      interactive: false,
      ui,
      history: () => undefined,
      stdout: (text) => stdout.push(text)
    });

    expect(exit).toBe(0);
    expect(stdout).toHaveLength(1);
    const parsed = JSON.parse(stdout[0] ?? '') as { result: string[] };
    expect(parsed.result).toHaveLength(1);
    expect(existsSync(join(root, parsed.result[0] ?? ''))).toBe(true);
  });
});

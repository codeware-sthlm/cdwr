import { confirm, multiselect, select } from '@clack/prompts';

import { Cancelled } from '../cli/errors';

import { createTerminalUi } from './terminal';

vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(),
  intro: vi.fn(),
  isCancel: (value: unknown) => typeof value === 'symbol',
  log: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
  multiselect: vi.fn(),
  note: vi.fn(),
  outro: vi.fn(),
  password: vi.fn(),
  select: vi.fn(),
  spinner: vi.fn(),
  text: vi.fn()
}));

const choices = [
  { value: 'preview', hint: 'per pull request' },
  { value: 'production' }
] as const;

describe('createTerminalUi', () => {
  it('prompts inline', () => {
    expect(createTerminalUi().interactive).toBe(true);
  });

  it('returns the chosen value, passing a hint only when there is one', async () => {
    vi.mocked(select).mockResolvedValue('production');

    const picked = await createTerminalUi().select({
      message: 'Env?',
      choices
    });

    expect(picked).toBe('production');
    expect(vi.mocked(select).mock.calls[0]?.[0].options).toEqual([
      { value: 'preview', label: 'preview', hint: 'per pull request' },
      { value: 'production', label: 'production' }
    ]);
  });

  it('keeps the choices order for a multiselect', async () => {
    vi.mocked(multiselect).mockResolvedValue(['production', 'preview']);

    const picked = await createTerminalUi().multiselect({
      message: 'Envs?',
      choices
    });

    expect(picked).toEqual(['preview', 'production']);
  });

  it('throws Cancelled on ctrl-c', async () => {
    vi.mocked(confirm).mockResolvedValue(Symbol('cancel'));

    await expect(
      createTerminalUi().confirm({ message: 'Go?' })
    ).rejects.toBeInstanceOf(Cancelled);
  });
});

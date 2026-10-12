import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import * as infisical from '../../services/infisical';
import { fakeUi } from '../../testing/fake-ui';

import command from './delete-folder';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('../../services/infisical', () => ({
  inspectInfisicalFolder: vi.fn(),
  deleteInfisicalFolder: vi.fn()
}));

const planned = [
  { path: '/tenants/moon', secrets: 1 },
  { path: '/tenants/moon/apps', secrets: 2 }
];

const run = async (argv: string[]) => {
  const ui = fakeUi([], false);
  const code = await runCommand({
    name: 'infisical delete-folder',
    command,
    argv,
    root: '/repo',
    env: {},
    prefs: memoryPrefs(),
    interactive: false,
    ui,
    history: () => undefined,
    stdout: () => undefined
  });
  return { code, ui };
};

const args = (env: string, ...rest: string[]) => [
  '--env',
  env,
  '--path',
  '/tenants/moon',
  ...rest
];

describe('infisical delete-folder', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(infisical.inspectInfisicalFolder).mockResolvedValue(planned);
    vi.mocked(infisical.deleteInfisicalFolder).mockResolvedValue(true);
  });

  it('never deletes on a dry run', async () => {
    const { code } = await run(args('preview', '--dry-run'));
    expect(code).toBe(EXIT.ok);
    expect(infisical.deleteInfisicalFolder).not.toHaveBeenCalled();
  });

  it('exits ok without deleting when the folder is missing', async () => {
    vi.mocked(infisical.inspectInfisicalFolder).mockResolvedValue(null);
    const { code } = await run(args('preview', '--yes'));
    expect(code).toBe(EXIT.ok);
    expect(infisical.deleteInfisicalFolder).not.toHaveBeenCalled();
  });

  it('needs --yes on production when not interactive', async () => {
    const { code } = await run(args('production'));
    expect(code).toBe(EXIT.usage);
    expect(infisical.deleteInfisicalFolder).not.toHaveBeenCalled();
  });

  it('fails when Infisical answers 404 after planning', async () => {
    vi.mocked(infisical.deleteInfisicalFolder).mockResolvedValue(false);
    const { code } = await run(args('preview', '--yes'));
    expect(code).toBe(EXIT.failed);
    expect(infisical.deleteInfisicalFolder).toHaveBeenCalledTimes(1);
  });

  it('fails without deleting when the folder changed since the plan', async () => {
    vi.mocked(infisical.inspectInfisicalFolder)
      .mockResolvedValueOnce(planned)
      .mockResolvedValueOnce([planned[0]!, { ...planned[1]!, secrets: 5 }]);
    const { code } = await run(args('preview', '--yes'));
    expect(code).toBe(EXIT.failed);
    expect(infisical.deleteInfisicalFolder).not.toHaveBeenCalled();
  });

  it('fails without deleting when the folder was removed since the plan', async () => {
    vi.mocked(infisical.inspectInfisicalFolder)
      .mockResolvedValueOnce(planned)
      .mockResolvedValueOnce(null);
    const { code } = await run(args('preview', '--yes'));
    expect(code).toBe(EXIT.failed);
    expect(infisical.deleteInfisicalFolder).not.toHaveBeenCalled();
  });

  it('deletes once on the happy path', async () => {
    const { code } = await run(args('preview', '--yes'));
    expect(code).toBe(EXIT.ok);
    expect(infisical.deleteInfisicalFolder).toHaveBeenCalledTimes(1);
    expect(infisical.deleteInfisicalFolder).toHaveBeenCalledWith({
      environment: 'preview',
      path: '/tenants/moon'
    });
  });
});

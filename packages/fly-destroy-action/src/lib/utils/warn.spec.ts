import * as core from '@actions/core';

import { warn, writeWarningsSummary } from './warn';

vi.mock('@actions/core', () => {
  const summary = {
    addHeading: vi.fn(),
    addList: vi.fn(),
    write: vi.fn()
  };
  summary.addHeading.mockReturnValue(summary);
  summary.addList.mockReturnValue(summary);
  summary.write.mockResolvedValue(summary);
  return { info: vi.fn(), warning: vi.fn(), summary };
});

describe('warn', () => {
  beforeEach(async () => {
    // Drop anything a previous test left collected
    await writeWarningsSummary();
    vi.clearAllMocks();
  });

  it('warns through core.warning', () => {
    warn('first');

    expect(core.warning).toHaveBeenCalledWith('first');
  });

  it('writes the heading and the collected messages once', async () => {
    warn('first');
    warn('second');

    await writeWarningsSummary();

    expect(core.summary.addHeading).toHaveBeenCalledTimes(1);
    expect(core.summary.addHeading).toHaveBeenCalledWith('Warnings', 3);
    expect(core.summary.addList).toHaveBeenCalledWith(['first', 'second']);
    expect(core.summary.write).toHaveBeenCalledTimes(1);
  });

  it('writes nothing without warnings', async () => {
    await writeWarningsSummary();

    expect(core.summary.addHeading).not.toHaveBeenCalled();
    expect(core.summary.write).not.toHaveBeenCalled();
  });

  it('clears the collected messages after writing', async () => {
    warn('first');
    await writeWarningsSummary();
    vi.clearAllMocks();

    await writeWarningsSummary();

    expect(core.summary.write).not.toHaveBeenCalled();
  });

  it('escapes html in the summary but not in the log', async () => {
    warn("Usage: postgres detach <app> & 'x'");

    await writeWarningsSummary();

    expect(core.warning).toHaveBeenCalledWith(
      "Usage: postgres detach <app> & 'x'"
    );
    expect(core.summary.addList).toHaveBeenCalledWith([
      "Usage: postgres detach &lt;app&gt; &amp; 'x'"
    ]);
  });

  it('does not throw when the summary cannot be written', async () => {
    vi.mocked(core.summary.write).mockRejectedValueOnce(
      new Error('GITHUB_STEP_SUMMARY is not set')
    );
    warn('first');

    await expect(writeWarningsSummary()).resolves.toBeUndefined();
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('GITHUB_STEP_SUMMARY is not set')
    );
  });
});

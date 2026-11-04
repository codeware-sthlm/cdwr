import * as core from '@actions/core';
import * as github from '@actions/github';

import { flyConditions } from './fly-conditions';

vi.mock('@actions/core');
vi.mock('@actions/github', () => ({
  ...vi.importActual('@actions/github'),
  context: {},
  getOctokit: vi.fn()
}));

describe('flyConditions', () => {
  const mockContext = vi.mocked(github.context);
  const mockGetOctokit = vi.mocked(github.getOctokit);

  const listLabelsMock = vi.fn();
  const addLabelsMock = vi.fn();

  const defaultInputs = {
    previewLabel: 'preview-deploy',
    token: 'gh-token'
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetOctokit.mockReturnValue({
      rest: {
        issues: {
          listLabelsOnIssue: listLabelsMock,
          addLabels: addLabelsMock
        }
      }
    } as unknown as ReturnType<typeof github.getOctokit>);

    listLabelsMock.mockResolvedValue({ data: [] });
    addLabelsMock.mockResolvedValue({ data: [] });

    mockContext.repo = { owner: 'org', repo: 'repo' };
    mockContext.ref = 'refs/heads/main';
    mockContext.payload = {};
  });

  describe('workflow_dispatch', () => {
    it('should continue for manual dispatch', async () => {
      mockContext.eventName = 'workflow_dispatch';
      const result = await flyConditions(defaultInputs);
      expect(result.skip).toBe(false);
    });
  });

  describe('blocked branch prefixes', () => {
    it.each(['renovate/update-deps', 'update-nx-workspace-v20'])(
      'should skip blocked branch %s',
      async (branch) => {
        mockContext.eventName = 'push';
        mockContext.ref = `refs/heads/${branch}`;
        const result = await flyConditions(defaultInputs);
        expect(result.skip).toBe(true);
      }
    );

    it('should not skip non-blocked branches', async () => {
      mockContext.eventName = 'push';
      mockContext.ref = 'refs/heads/main';
      const result = await flyConditions(defaultInputs);
      expect(result.skip).toBe(false);
    });
  });

  describe('non pull_request events', () => {
    it('should continue for push to main', async () => {
      mockContext.eventName = 'push';
      mockContext.ref = 'refs/heads/main';
      const result = await flyConditions(defaultInputs);
      expect(result.skip).toBe(false);
    });
  });

  describe('pull_request events', () => {
    beforeEach(() => {
      mockContext.eventName = 'pull_request';
      mockContext.ref = 'refs/heads/feature/my-feature';
      mockContext.payload = {
        pull_request: {
          number: 42,
          state: 'open',
          head: { ref: 'feature/my-feature' }
        }
      };
    });

    it('should continue for closed PR', async () => {
      mockContext.payload = { ...mockContext.payload, action: 'closed' };
      const result = await flyConditions(defaultInputs);
      expect(result.skip).toBe(false);
      expect(mockGetOctokit).not.toHaveBeenCalled();
    });

    it.each(['opened', 'reopened', 'synchronize'])(
      'should continue for %s when the preview label is present',
      async (action) => {
        mockContext.payload = { ...mockContext.payload, action };
        listLabelsMock.mockResolvedValue({
          data: [{ name: 'preview-deploy' }, { name: 'other' }]
        });

        const result = await flyConditions(defaultInputs);

        expect(listLabelsMock).toHaveBeenCalledWith(
          expect.objectContaining({ issue_number: 42 })
        );
        expect(result.skip).toBe(false);
      }
    );

    it.each(['opened', 'reopened', 'synchronize'])(
      'should skip for %s without the preview label, and never add it',
      async (action) => {
        mockContext.payload = { ...mockContext.payload, action };
        listLabelsMock.mockResolvedValue({ data: [{ name: 'other' }] });

        const result = await flyConditions(defaultInputs);

        expect(addLabelsMock).not.toHaveBeenCalled();
        expect(result.skip).toBe(true);
      }
    );

    it('should continue when the preview label is added', async () => {
      mockContext.payload = {
        ...mockContext.payload,
        action: 'labeled',
        label: { name: 'preview-deploy' }
      };

      const result = await flyConditions(defaultInputs);

      expect(mockGetOctokit).not.toHaveBeenCalled();
      expect(result.skip).toBe(false);
    });

    it('should skip when a labeled event carries no label', async () => {
      mockContext.payload = { ...mockContext.payload, action: 'labeled' };

      const result = await flyConditions(defaultInputs);

      expect(mockGetOctokit).not.toHaveBeenCalled();
      expect(result.skip).toBe(true);
    });

    it.each(['closed', undefined])(
      'should skip when the preview label is added to a pull request whose state is %s',
      async (state) => {
        mockContext.payload = {
          ...mockContext.payload,
          action: 'labeled',
          label: { name: 'preview-deploy' },
          pull_request: {
            ...(mockContext.payload['pull_request'] as object),
            state
          }
        };

        const result = await flyConditions(defaultInputs);

        expect(mockGetOctokit).not.toHaveBeenCalled();
        expect(result.skip).toBe(true);
      }
    );

    it('should skip when another label is added, even with the preview label present', async () => {
      mockContext.payload = {
        ...mockContext.payload,
        action: 'labeled',
        label: { name: 'agent:review' }
      };
      listLabelsMock.mockResolvedValue({ data: [{ name: 'preview-deploy' }] });

      const result = await flyConditions(defaultInputs);

      expect(mockGetOctokit).not.toHaveBeenCalled();
      expect(result.skip).toBe(true);
    });

    it('should skip when pull request number is not in context', async () => {
      mockContext.payload = { action: 'synchronize' };

      const result = await flyConditions(defaultInputs);

      expect(core.setFailed).toHaveBeenCalled();
      expect(result.skip).toBe(true);
    });
  });
});

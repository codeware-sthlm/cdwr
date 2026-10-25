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
  const listEventsMock = vi.fn();
  const paginateMock = vi.fn();

  const defaultInputs = {
    previewLabel: 'preview-deploy',
    token: 'gh-token'
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetOctokit.mockReturnValue({
      paginate: paginateMock,
      rest: {
        issues: {
          listLabelsOnIssue: listLabelsMock,
          addLabels: addLabelsMock,
          listEvents: listEventsMock
        }
      }
    } as unknown as ReturnType<typeof github.getOctokit>);

    listLabelsMock.mockResolvedValue({ data: [] });
    addLabelsMock.mockResolvedValue({ data: [] });
    paginateMock.mockResolvedValue([]);

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
        pull_request: { number: 42, head: { ref: 'feature/my-feature' } }
      };
    });

    it('should continue for closed PR', async () => {
      mockContext.payload = { ...mockContext.payload, action: 'closed' };
      const result = await flyConditions(defaultInputs);
      expect(result.skip).toBe(false);
      expect(mockGetOctokit).not.toHaveBeenCalled();
    });

    it('should add label and continue when PR is opened and label is missing', async () => {
      mockContext.payload = { ...mockContext.payload, action: 'opened' };
      listLabelsMock.mockResolvedValue({ data: [] });

      const result = await flyConditions(defaultInputs);

      expect(addLabelsMock).toHaveBeenCalledWith({
        owner: 'org',
        repo: 'repo',
        issue_number: 42,
        labels: ['preview-deploy']
      });
      expect(result.skip).toBe(false);
    });

    it('should not re-add label when PR is reopened and label already exists', async () => {
      mockContext.payload = { ...mockContext.payload, action: 'reopened' };
      listLabelsMock.mockResolvedValue({ data: [{ name: 'preview-deploy' }] });

      const result = await flyConditions(defaultInputs);

      expect(addLabelsMock).not.toHaveBeenCalled();
      expect(result.skip).toBe(false);
    });

    it('should continue for synchronize when preview label is present', async () => {
      mockContext.payload = { ...mockContext.payload, action: 'synchronize' };
      listLabelsMock.mockResolvedValue({
        data: [{ name: 'preview-deploy' }, { name: 'other' }]
      });

      const result = await flyConditions(defaultInputs);

      expect(result.skip).toBe(false);
    });

    it('should add a missing preview label for synchronize when it was never removed', async () => {
      mockContext.payload = { ...mockContext.payload, action: 'synchronize' };
      listLabelsMock.mockResolvedValue({ data: [{ name: 'other' }] });
      paginateMock.mockResolvedValue([
        { event: 'labeled', label: { name: 'other' } }
      ]);

      const result = await flyConditions(defaultInputs);

      expect(paginateMock).toHaveBeenCalledWith(
        listEventsMock,
        expect.objectContaining({ issue_number: 42 })
      );
      expect(addLabelsMock).toHaveBeenCalledWith(
        expect.objectContaining({ labels: ['preview-deploy'] })
      );
      expect(result.skip).toBe(false);
    });

    it('should add the preview label for synchronize when it was removed before the PR was reopened', async () => {
      mockContext.payload = { ...mockContext.payload, action: 'synchronize' };
      listLabelsMock.mockResolvedValue({ data: [] });
      paginateMock.mockResolvedValue([
        { event: 'unlabeled', label: { name: 'preview-deploy' } },
        { event: 'closed' },
        { event: 'reopened' }
      ]);

      const result = await flyConditions(defaultInputs);

      expect(addLabelsMock).toHaveBeenCalledWith(
        expect.objectContaining({ labels: ['preview-deploy'] })
      );
      expect(result.skip).toBe(false);
    });

    it('should skip for synchronize when the preview label was removed', async () => {
      mockContext.payload = { ...mockContext.payload, action: 'synchronize' };
      listLabelsMock.mockResolvedValue({ data: [{ name: 'other' }] });
      paginateMock.mockResolvedValue([
        { event: 'labeled', label: { name: 'preview-deploy' } },
        { event: 'unlabeled', label: { name: 'preview-deploy' } }
      ]);

      const result = await flyConditions(defaultInputs);

      expect(addLabelsMock).not.toHaveBeenCalled();
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

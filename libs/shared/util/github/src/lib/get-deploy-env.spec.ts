import type { context } from '@actions/github';

import { getDeployEnv } from './get-deploy-env';

type Context = typeof context;

describe('getDeployEnv', () => {
  const createContext = (eventName: string, ref: string): Partial<Context> => ({
    eventName,
    ref
  });

  describe('pull_request event', () => {
    it('should return preview environment for pull request', () => {
      const context = createContext('pull_request', 'refs/heads/feature');
      const result = getDeployEnv(context as Context, 'main');

      expect(result).toEqual({ environment: 'preview' });
    });
  });

  describe('push event', () => {
    it('should return production environment for push to main branch', () => {
      const context = createContext('push', 'refs/heads/main');
      const result = getDeployEnv(context as Context, 'main');

      expect(result).toEqual({ environment: 'production' });
    });

    it('should return production environment for push to custom main branch', () => {
      const context = createContext('push', 'refs/heads/master');
      const result = getDeployEnv(context as Context, 'master');

      expect(result).toEqual({ environment: 'production' });
    });

    it('should return null for push to feature branch', () => {
      const context = createContext('push', 'refs/heads/feature');
      const result = getDeployEnv(context as Context, 'main');

      expect(result).toEqual({
        environment: null,
        reason:
          "'feature' is not supported for production deployment, only 'main' is supported"
      });
    });

    it('should return null for push to development branch', () => {
      const context = createContext('push', 'refs/heads/develop');
      const result = getDeployEnv(context as Context, 'main');

      expect(result).toEqual({
        environment: null,
        reason:
          "'develop' is not supported for production deployment, only 'main' is supported"
      });
    });
  });

  describe('workflow_dispatch event', () => {
    it('should return null with manual deployment message', () => {
      const context = createContext('workflow_dispatch', 'refs/heads/main');
      const result = getDeployEnv(context as Context, 'main');

      expect(result).toEqual({
        environment: null,
        reason:
          'Manual deployment triggered - environment will be determined by workflow inputs'
      });
    });

    it('should return null for workflow_dispatch on feature branch', () => {
      const context = createContext('workflow_dispatch', 'refs/heads/feature');
      const result = getDeployEnv(context as Context, 'main');

      expect(result).toEqual({
        environment: null,
        reason:
          'Manual deployment triggered - environment will be determined by workflow inputs'
      });
    });
  });

  describe('unsupported events', () => {
    it('should return null for tag event', () => {
      const context = createContext('tag', 'refs/tags/v1.0.0');
      const result = getDeployEnv(context as Context, 'main');

      expect(result).toEqual({
        environment: null,
        reason:
          "'tag' is not a supported event for deployment, only 'pull_request', 'push', and 'workflow_dispatch' are supported"
      });
    });

    it('should return null for release event', () => {
      const context = createContext('release', 'refs/heads/main');
      const result = getDeployEnv(context as Context, 'main');

      expect(result).toEqual({
        environment: null,
        reason:
          "'release' is not a supported event for deployment, only 'pull_request', 'push', and 'workflow_dispatch' are supported"
      });
    });

    it('should return null for schedule event', () => {
      const context = createContext('schedule', 'refs/heads/main');
      const result = getDeployEnv(context as Context, 'main');

      expect(result).toEqual({
        environment: null,
        reason:
          "'schedule' is not a supported event for deployment, only 'pull_request', 'push', and 'workflow_dispatch' are supported"
      });
    });
  });

  describe('error handling', () => {
    it('should handle missing ref gracefully', () => {
      const context = {
        eventName: 'push'
      } as Context;

      const result = getDeployEnv(context, 'main');

      // Should still return a result, though behavior may vary
      expect(result).toHaveProperty('environment');
    });

    it('should handle malformed ref', () => {
      const context = createContext('push', 'invalid-ref-format');
      const result = getDeployEnv(context as Context, 'main');

      // Should still return a result
      expect(result).toHaveProperty('environment');
    });
  });
});

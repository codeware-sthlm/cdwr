import { describe, expect, it } from 'vitest';

import {
  MAX_DEPLOYMENT_NAME_LENGTH,
  deploymentNameIssue
} from './deployment-name';

describe('deploymentNameIssue', () => {
  it.each(['demo', 'ks-vininfo', 'cdwr', 'site2', 'pr-shop', 'prelude'])(
    'accepts %s',
    (name) => {
      expect(deploymentNameIssue(name)).toBeNull();
    }
  );

  it('refuses an empty name', () => {
    expect(deploymentNameIssue('')).toBe('empty');
  });

  it.each(['Demo', 'ks_vininfo', 'demo.site', 'demo site', 'räksmörgås'])(
    'refuses %s, which a Fly app name cannot hold',
    (name) => {
      expect(deploymentNameIssue(name)).toBe('characters');
    }
  );

  it('refuses the reserved folder for a deployment with no tenant', () => {
    // Refused on its underscore, which is the point: it can never be chosen
    expect(deploymentNameIssue('_default')).toBe('characters');
  });

  it.each(['-demo', 'demo-', 'ks--vininfo'])('refuses %s', (name) => {
    expect(deploymentNameIssue(name)).toBe('hyphens');
  });

  it.each(['pr-12', 'pr-7-demo', 'pr-123'])(
    'refuses %s, which would take a preview app name',
    (name) => {
      expect(deploymentNameIssue(name)).toBe('reserved');
    }
  );

  it('refuses a name too long to leave room for the app prefix', () => {
    expect(
      deploymentNameIssue('a'.repeat(MAX_DEPLOYMENT_NAME_LENGTH))
    ).toBeNull();
    expect(
      deploymentNameIssue('a'.repeat(MAX_DEPLOYMENT_NAME_LENGTH + 1))
    ).toBe('too-long');
  });
});

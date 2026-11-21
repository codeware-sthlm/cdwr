import { describe, expect, it } from 'vitest';

import {
  MAX_DEPLOYMENT_NAME_LENGTH,
  deploymentNameIssue,
  toDeploymentName
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

  it('refuses a name starting with an underscore', () => {
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

describe('toDeploymentName', () => {
  it.each([
    ['Håkans Båtturer', 'hakans-batturer'],
    ['Räksmörgås & Co.', 'raksmorgas-co'],
    ['Café Ünder Œuvre', 'cafe-under-oeuvre'],
    ['Æble og Ølfabrik', 'aeble-og-olfabrik'],
    ['Straße', 'strasse'],
    ['a --- b ... c', 'a-b-c'],
    ['  --Demo--  ', 'demo'],
    ['Site 2', 'site-2']
  ])('turns %s into %s', (input, expected) => {
    expect(toDeploymentName(input)).toBe(expected);
  });

  it('cuts to the length limit without leaving a trailing hyphen', () => {
    const long = toDeploymentName('a'.repeat(60));
    expect(long).toHaveLength(MAX_DEPLOYMENT_NAME_LENGTH);

    const name = `${'a'.repeat(MAX_DEPLOYMENT_NAME_LENGTH - 1)} b`;
    expect(toDeploymentName(name)).toBe(
      'a'.repeat(MAX_DEPLOYMENT_NAME_LENGTH - 1)
    );
  });

  it.each([
    ['PR 12', 'site-pr-12'],
    ['pr-7 demo', 'site-pr-7-demo']
  ])('keeps %s clear of the names a preview is given', (input, expected) => {
    expect(toDeploymentName(input)).toBe(expected);
  });

  it.each(['', '   ', '!!!', '🚀', '🚀🚀 ✨', '---'])(
    'returns nothing for %j',
    (input) => {
      expect(toDeploymentName(input)).toBe('');
    }
  );

  it('always yields a usable name when something is left', () => {
    const inputs = [
      'Demo',
      'Håkans Båtturer',
      'pr-1',
      'PR 99 shop',
      'pr-12-demo',
      '--x--',
      'x'.repeat(100),
      `pr-5 ${'y'.repeat(80)}`,
      'a'.repeat(39) + ' bcd',
      'Östersunds Vinhandel AB (publ)',
      'Ålem / Ödeshög',
      '🚀 Launch 2026',
      '123',
      'ÆØ ß',
      'Straße-#-!'
    ];

    for (const input of inputs) {
      expect(deploymentNameIssue(toDeploymentName(input))).toBeNull();
    }
  });
});

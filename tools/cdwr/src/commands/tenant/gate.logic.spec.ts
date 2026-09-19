import type { TenantApp } from '../../services/infisical';

import {
  type AppState,
  GATE_KEY,
  MIN_PASSWORD_LENGTH,
  anyClosed,
  anyStored,
  describeOnFly,
  generatePassword,
  prChoices,
  pullRequestChoices,
  targetFlyApp,
  tenantHint
} from './gate.logic';

describe('generatePassword', () => {
  it('is long enough and url-safe', () => {
    const password = generatePassword();
    expect(password.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    expect(password).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('differs between calls', () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});

describe('describeOnFly', () => {
  it('maps every state to its word', () => {
    expect(describeOnFly('missing')).toBe('open');
    expect(describeOnFly('set')).toBe('closed');
    expect(describeOnFly('unreachable')).toBe('not deployed');
  });
});

describe('pullRequestChoices', () => {
  it('dedupes and preserves first-seen order', () => {
    const apps = ['cdwr-cms-pr-12', 'cdwr-cms-pr-7-tenant', 'cdwr-cms-pr-12'];
    expect(pullRequestChoices(apps)).toEqual([12, 7]);
  });

  it('ignores names without a pull request', () => {
    expect(pullRequestChoices(['cdwr-cms'])).toEqual([]);
  });

  it('moves the current pull request first when present', () => {
    const apps = ['cdwr-cms-pr-12', 'cdwr-cms-pr-7'];
    expect(pullRequestChoices(apps, 7)).toEqual([7, 12]);
  });

  it('leaves the order alone when the current pull request is absent', () => {
    const apps = ['cdwr-cms-pr-12', 'cdwr-cms-pr-7'];
    expect(pullRequestChoices(apps, 99)).toEqual([12, 7]);
  });
});

describe('prChoices', () => {
  it('appends the write-only option after every pull request', () => {
    expect(prChoices([12, 7])).toEqual([
      { value: '12', label: 'PR #12' },
      { value: '7', label: 'PR #7' },
      {
        value: 'none',
        label: 'None of them',
        hint: 'write Infisical only, for the next deploy'
      }
    ]);
  });

  it('is just the write-only option with nothing deployed', () => {
    expect(prChoices([])).toEqual([
      {
        value: 'none',
        label: 'None of them',
        hint: 'write Infisical only, for the next deploy'
      }
    ]);
  });
});

describe('targetFlyApp', () => {
  it('is empty for preview with no pull request, without naming an app', () => {
    const nameApp = vi.fn(() => 'should-not-be-called');
    expect(targetFlyApp('preview', undefined, nameApp)).toBe('');
    expect(nameApp).not.toHaveBeenCalled();
  });

  it('names the app for preview with a pull request', () => {
    const nameApp = vi.fn(() => 'cdwr-cms-pr-12-acme');
    expect(targetFlyApp('preview', 12, nameApp)).toBe('cdwr-cms-pr-12-acme');
    expect(nameApp).toHaveBeenCalledOnce();
  });

  it('always names the app for production', () => {
    const nameApp = vi.fn(() => 'cdwr-cms-acme');
    expect(targetFlyApp('production', undefined, nameApp)).toBe(
      'cdwr-cms-acme'
    );
  });
});

describe('tenantHint', () => {
  it('reports open when nothing is gated', () => {
    const apps = [{ app: 'cms', secrets: {} }];
    expect(tenantHint(apps)).toBe('cms — open');
  });

  it('names the gated apps', () => {
    const apps: TenantApp[] = [
      { app: 'cms', secrets: { [GATE_KEY]: 'x' } },
      { app: 'web', secrets: {} }
    ];
    expect(tenantHint(apps)).toBe('cms, web — gated: cms');
  });
});

describe('anyClosed / anyStored', () => {
  const states: AppState[] = [
    {
      app: 'cms',
      secretPath: '/x',
      inInfisical: false,
      flyApp: '',
      onFly: 'missing'
    },
    {
      app: 'web',
      secretPath: '/y',
      inInfisical: true,
      flyApp: 'a',
      onFly: 'set'
    }
  ];

  it('anyClosed is true when a running app carries the password', () => {
    expect(anyClosed(states)).toBe(true);
    expect(anyClosed([states[0] as AppState])).toBe(false);
  });

  it('anyStored is true when Infisical holds a password for any app', () => {
    expect(anyStored(states)).toBe(true);
    expect(anyStored([states[1] as AppState])).toBe(true);
    expect(anyStored([{ ...states[0], inInfisical: false } as AppState])).toBe(
      false
    );
  });
});

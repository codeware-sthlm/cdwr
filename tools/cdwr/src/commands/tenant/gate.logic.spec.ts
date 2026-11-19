import type { TenantApp } from '../../services/infisical';

import {
  type AppState,
  FLY_ERROR_MAX,
  GATE_KEY,
  MIN_PASSWORD_LENGTH,
  anyClosed,
  anyStored,
  describeOnFly,
  flyErrorOf,
  generatePassword,
  partialReason,
  prChoices,
  pullRequestChoices,
  targetFlyApp,
  tenantHint,
  unreadApps
} from './gate.logic';

describe('flyErrorOf', () => {
  it("keeps the CLI's own last line", () => {
    const error = new Error(
      '[list secrets] something broke\nCommand failed with exit code 1: fly secrets list\n\nError: unauthorized\n'
    );
    expect(flyErrorOf(error)).toBe('Error: unauthorized');
  });

  it('reads a repeated Error prefix once', () => {
    const error = new Error(
      "Error: Error: no access token available. Please login with 'flyctl auth login'"
    );
    expect(flyErrorOf(error)).toBe(
      "Error: no access token available. Please login with 'flyctl auth login'"
    );
  });

  it('reads a non-Error value', () => {
    expect(flyErrorOf('timed out')).toBe('timed out');
  });

  it('cuts a long line to fit a desk row', () => {
    const out = flyErrorOf(new Error('x'.repeat(400)));
    expect(out).toHaveLength(FLY_ERROR_MAX);
    expect(out.endsWith('…')).toBe(true);
  });

  it('replaces anything shaped like a Fly token', () => {
    const out = flyErrorOf(
      new Error('Error: bad token FlyV1 fm2_abc123,fm2_def456 and fm1_xyz-9')
    );
    expect(out).toBe('Error: bad token … and …');
    expect(out).not.toMatch(/fm[12]_|FlyV1/);
  });
});

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

describe('unreadApps / partialReason', () => {
  const app = (over: Partial<AppState>): AppState => ({
    app: 'cms',
    secretPath: '/x',
    inInfisical: false,
    flyApp: 'cdwr-cms-acme',
    onFly: 'set',
    ...over
  });
  const cms = app({ onFly: 'unreachable', flyError: 'Error: unauthorized' });
  const web = app({
    app: 'headless',
    flyApp: 'cdwr-headless-acme',
    onFly: 'unreachable',
    flyError: 'Error: app not found'
  });

  it('keeps only apps whose Fly read failed', () => {
    expect(unreadApps([app({}), cms, app({ onFly: 'missing' })])).toEqual([
      cms
    ]);
  });

  it('skips a preview gate that names no app', () => {
    expect(unreadApps([app({ flyApp: '', onFly: 'unreachable' })])).toEqual([]);
  });

  it('names the first app and its error', () => {
    expect(partialReason([cms])).toBe(
      'cdwr-cms-acme not read on Fly: Error: unauthorized'
    );
  });

  it('counts the rest', () => {
    expect(partialReason([cms, web])).toBe(
      'cdwr-cms-acme not read on Fly: Error: unauthorized (+1 more)'
    );
  });

  it('cuts a long line to fit a desk row', () => {
    const out = partialReason([
      app({ onFly: 'unreachable', flyError: 'x'.repeat(FLY_ERROR_MAX) })
    ]);
    expect(out).toHaveLength(FLY_ERROR_MAX);
    expect(out.endsWith('…')).toBe(true);
  });

  it('names an app Fly would not open beside an unread one', () => {
    expect(
      partialReason(
        [cms],
        [{ flyApp: 'cdwr-headless-acme', flyError: 'Error: timeout' }]
      )
    ).toBe(
      'cdwr-cms-acme not read on Fly: Error: unauthorized; cdwr-headless-acme still closed on Fly: Error: timeout'
    );
    expect(
      partialReason([], [{ flyApp: 'cdwr-cms-acme', flyError: 'Error: x' }])
    ).toBe('cdwr-cms-acme still closed on Fly: Error: x');
  });

  it('is empty with nothing unread', () => {
    expect(partialReason([])).toBe('');
  });
});

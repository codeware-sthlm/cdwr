import {
  APP,
  COUNT,
  FUNCTION,
  MIGRATION,
  outcomeLine,
  parseApplyList,
  validateItem
} from './apply-list.logic';

const MIGRATION_FILE =
  'tools/cdwr/agent-queue/supabase/migrations/20261120120000_applied_migrations.sql';

const ctx = {
  apps: ['cms', 'headless'],
  functionExists: (name: string) => name === 'ingest',
  addedFiles: [MIGRATION_FILE]
};

const first = (line: string) => {
  const [item] = parseApplyList(`Apply list:\n${line}`);
  if (!item) throw new Error(`no item in ${line}`);
  return item;
};

describe('parseApplyList', () => {
  it('returns nothing without an apply list', () => {
    expect(parseApplyList('Hand-off checklist:\n- [ ] do it')).toEqual([]);
    expect(parseApplyList('')).toEqual([]);
  });

  it('reads items after the header, skipping blank lines', () => {
    const items = parseApplyList(
      [
        'Hand-off checklist:',
        '- [ ] only Håkan',
        '',
        'Apply list:',
        '',
        '- [ ] restart cdwr-cms',
        '* [ ] scale cdwr-cms 2 after-deploy',
        '- [ ] agent-deploy'
      ].join('\n')
    );
    expect(items.map((item) => item.spec)).toEqual([
      'restart cdwr-cms',
      'scale cdwr-cms 2 after-deploy',
      'agent-deploy'
    ]);
    expect(items[0]).toMatchObject({
      kind: 'restart',
      args: ['cdwr-cms'],
      afterDeploy: false,
      checked: false,
      dropped: false,
      outcome: null
    });
  });

  it('accepts a bold header', () => {
    expect(parseApplyList('**Apply list:**\n- [ ] agent-deploy')).toHaveLength(
      1
    );
  });

  it('marks after-deploy and removes it from the args', () => {
    expect(first('- [ ] scale cdwr-cms 2 after-deploy')).toMatchObject({
      kind: 'scale',
      args: ['cdwr-cms', '2'],
      afterDeploy: true
    });
  });

  it('splits the outcome at the first separator', () => {
    expect(
      first('- [x] restart cdwr-cms · applied 2026-11-20T07:12Z · ok')
    ).toMatchObject({
      spec: 'restart cdwr-cms',
      outcome: 'applied 2026-11-20T07:12Z · ok',
      checked: true,
      dropped: false
    });
  });

  it('reads an upper case X as checked', () => {
    expect(first('- [X] agent-deploy').checked).toBe(true);
  });

  it('marks an unchecked struck item as dropped', () => {
    expect(
      first('- [ ] ~~deploy-workflow cms production~~ dropped by hand')
    ).toMatchObject({ dropped: true, checked: false });
  });

  it('ends the block at a line that is not an item', () => {
    const items = parseApplyList(
      'Apply list:\n- [ ] agent-deploy\nNotes\n- [ ] restart cdwr-cms'
    );
    expect(items).toHaveLength(1);
  });

  it('ends the block at a list line without a box', () => {
    expect(parseApplyList('Apply list:\n- agent-deploy')).toEqual([]);
  });

  it('handles CRLF bodies', () => {
    expect(
      parseApplyList('Apply list:\r\n- [ ] agent-deploy\r\n')
    ).toHaveLength(1);
  });
});

describe('validateItem', () => {
  it.each([
    'restart cdwr-cms',
    'restart cdwr-cms-acme',
    'restart cdwr-headless-acme',
    'scale cdwr-cms 1',
    'scale cdwr-headless-acme 4 after-deploy',
    'deploy-workflow cms production',
    `supabase-migration ${MIGRATION_FILE}`,
    'supabase-function ingest',
    'agent-deploy',
    'secret-copy production /apps/cms DATABASE_URL DIRECT_DATABASE_URL',
    'secret-copy preview /tenants/moon/apps/cms A_B C_D',
    'secret-rewrite production /apps/cms DATABASE_URL host=aws-0-eu-central-1.pooler.supabase.com port=6543 user=postgres.abcdefgh after-deploy',
    'secret-rewrite preview /apps/cms DATABASE_URL port=6543',
    'secret-set production /apps/cms DATABASE_POOL_MAX 4',
    'secret-set preview /apps/cms FEATURE_ON true',
    'secret-set production /apps/cms PUBLIC_URL https://example.com/path',
    'secret-set production /apps/cms POOL https://a.b/path',
    'secret-rewrite production /apps/cms DATABASE_URL port=6543',
    'nuc-install'
  ])('accepts %s', (spec) => {
    expect(validateItem(first(`- [ ] ${spec}`), ctx)).toBeNull();
  });

  it.each([
    ['restart cdwr-agent', 'bad app cdwr-agent'],
    ['restart builder', 'bad app builder'],
    ['restart cdwr-cms-', 'bad app cdwr-cms-'],
    ['restart', 'restart takes 1 argument'],
    ['restart cdwr-cms extra', 'restart takes 1 argument'],
    ['scale cdwr-cms 0', 'count must be 1–4'],
    ['scale cdwr-cms 5', 'count must be 1–4'],
    ['scale cdwr-agent 2', 'bad app cdwr-agent'],
    ['scale cdwr-cms', 'scale takes 2 arguments'],
    [
      'deploy-workflow cms-x production',
      'cms-x is not in the apps release group'
    ],
    ['deploy-workflow cms preview', 'only production'],
    ['deploy-workflow cms', 'deploy-workflow takes 2 arguments'],
    ['supabase-migration ../x.sql', 'not a migration file'],
    [
      'supabase-migration tools/cdwr/agent-queue/supabase/migrations/20261120120001_other.sql',
      'the branch does not add tools/cdwr/agent-queue/supabase/migrations/20261120120001_other.sql'
    ],
    ['supabase-function missing', 'no function missing'],
    ['supabase-function ../x', 'no function ../x'],
    ['agent-deploy now', 'agent-deploy takes 0 arguments'],
    ['reboot cdwr-cms', 'unknown kind reboot'],
    ['secret-copy production /apps/cms A', 'secret-copy takes 4 arguments'],
    ['secret-copy development /apps/cms A B', 'only production or preview'],
    ['secret-copy production /agent-queue A B', 'bad folder /agent-queue'],
    ['secret-copy production / A B', 'bad folder /'],
    ['secret-copy production /apps A B', 'bad folder /apps'],
    ['secret-copy production /apps/cms/ A B', 'bad folder /apps/cms/'],
    ['secret-copy production /apps/Cms A B', 'bad folder /apps/Cms'],
    [
      'secret-copy production /tenants/moon/apps A B',
      'bad folder /tenants/moon/apps'
    ],
    ['secret-copy production /apps/cms a B', 'bad key a'],
    [
      'secret-copy production /apps/cms DEPLOY_ENABLED B',
      'DEPLOY_ENABLED is off limits'
    ],
    [
      'secret-copy production /apps/cms A SITE_GATE_PASSWORD',
      'SITE_GATE_PASSWORD is off limits'
    ],
    ['secret-copy production /apps/cms A A', 'from and to are the same key'],
    [
      'secret-rewrite production /apps/cms DATABASE_URL',
      'secret-rewrite takes <env> <folder> <key> and 1–3 parts'
    ],
    [
      'secret-rewrite production /apps/cms DATABASE_URL port=1 port=2',
      'port given twice'
    ],
    [
      'secret-rewrite production /apps/cms DATABASE_URL password=x',
      'unknown part password'
    ],
    [
      'secret-rewrite production /apps/cms DATABASE_URL port=0',
      'port must be 1–65535'
    ],
    [
      'secret-rewrite production /apps/cms DATABASE_URL port=65536',
      'port must be 1–65535'
    ],
    [
      'secret-rewrite production /apps/cms DATABASE_URL host=A.com',
      'bad host A.com'
    ],
    [
      'secret-rewrite production /apps/cms DATABASE_URL user=a@b',
      'bad user a@b'
    ],
    [
      'secret-rewrite production /apps/cms DATABASE_URL host=a.com host=b',
      'host given twice'
    ],
    [
      'secret-rewrite production /apps/cms DATABASE_URL host=a.com port=1 user=u host=b',
      'secret-rewrite takes <env> <folder> <key> and 1–3 parts'
    ],
    [
      'secret-rewrite development /apps/cms DATABASE_URL port=1',
      'only production or preview'
    ],
    [
      'secret-rewrite production /apps/cms SITE_GATE_PASSWORD port=1',
      'SITE_GATE_PASSWORD is off limits'
    ],
    [
      'secret-set production /apps/cms DATABASE_POOL_MAX',
      'secret-set takes 4 arguments'
    ],
    ['secret-set development /apps/cms A 4', 'only production or preview'],
    [
      'secret-set production /apps/cms DEPLOY_ENABLED true',
      'DEPLOY_ENABLED is off limits'
    ],
    [
      'secret-set production /apps/cms API_KEY 4',
      'API_KEY looks like a secret'
    ],
    [
      'secret-set production /apps/cms X_TOKEN 4',
      'X_TOKEN looks like a secret'
    ],
    [
      'secret-set production /apps/cms X_SECRET 4',
      'X_SECRET looks like a secret'
    ],
    [
      'secret-set production /apps/cms X_PASSWORD 4',
      'X_PASSWORD looks like a secret'
    ],
    [
      'secret-set production /apps/cms POOL max',
      'value must be a number, true, false or an https url without credentials'
    ],
    [
      'secret-set production /apps/cms POOL http://x.com',
      'value must be a number, true, false or an https url without credentials'
    ],
    [
      'secret-set production /apps/cms POOL https://u:p@x.com',
      'value must be a number, true, false or an https url without credentials'
    ],
    [
      'secret-set production /apps/cms POOL https://u@x.com/',
      'value must be a number, true, false or an https url without credentials'
    ],
    [
      'secret-set production /apps/cms POOL -4',
      'value must be a number, true, false or an https url without credentials'
    ],
    [
      'secret-rewrite production /apps/cms DATABASE_URL port=06543',
      'port must be 1–65535'
    ],
    [
      'secret-set production /apps/cms POOL https://x.com?u@p',
      'value must be a number, true, false or an https url without credentials'
    ],
    [
      'secret-set production /apps/cms POOL https://hooks.example.com/x?token=abc',
      'value must be a number, true, false or an https url without credentials'
    ],
    [
      'secret-set production /apps/cms POOL https://a.b/#k=v',
      'value must be a number, true, false or an https url without credentials'
    ],
    [
      'secret-set production /apps/cms SITE_URL 4',
      'SITE_URL must be an https url without credentials'
    ],
    ['nuc-install abc', 'nuc-install takes 0 arguments']
  ])('refuses %s', (spec, why) => {
    expect(validateItem(first(`- [ ] ${spec}`), ctx)).toBe(why);
  });

  it('does not look at checked or dropped items', () => {
    expect(validateItem(first('- [x] reboot cdwr-cms'), ctx)).toBeNull();
    expect(validateItem(first('- [ ] ~~reboot cdwr-cms~~'), ctx)).toBeNull();
  });
});

describe('shared patterns', () => {
  it('match what the vocabulary allows', () => {
    expect(APP.test('cdwr-cms')).toBe(true);
    expect(APP.test('cdwr-agent')).toBe(false);
    expect(COUNT.test('4')).toBe(true);
    expect(COUNT.test('12')).toBe(false);
    expect(MIGRATION.test(MIGRATION_FILE)).toBe(true);
    expect(FUNCTION.test('a-b')).toBe(true);
    expect(FUNCTION.test('-a')).toBe(false);
  });
});

describe('outcomeLine', () => {
  it('writes a ticked or an open item line', () => {
    expect(outcomeLine('restart cdwr-cms', 'applied', true)).toBe(
      '- [x] restart cdwr-cms · applied'
    );
    expect(outcomeLine('agent-deploy', 'refused: not enabled', false)).toBe(
      '- [ ] agent-deploy · refused: not enabled'
    );
  });

  it('round-trips through the parser', () => {
    expect(
      first(outcomeLine('scale cdwr-cms 2', 'already 2', true))
    ).toMatchObject({
      spec: 'scale cdwr-cms 2',
      outcome: 'already 2',
      checked: true
    });
  });
});

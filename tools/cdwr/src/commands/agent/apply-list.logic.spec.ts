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
    ['nuc-install abc', 'nuc-install takes 0 arguments'],
    ['reboot cdwr-cms', 'unknown kind reboot']
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

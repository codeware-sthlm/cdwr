import { summarizeTeams, teamLine } from './stats-teams.logic';

describe('teamLine', () => {
  it('lists the steps', () => {
    expect(
      teamLine('acme', ['create-team', 'move-website', 'add-reader'])
    ).toBe('acme  create team · move website · add reader');
  });

  it('says ok without steps', () => {
    expect(teamLine('acme', [])).toBe('acme  ok');
  });
});

describe('summarizeTeams', () => {
  it('counts each outcome', () => {
    expect(
      summarizeTeams([
        { deployment: 'a', steps: [], status: 'ok' },
        { deployment: 'b', steps: ['create-team'], status: 'done' },
        { deployment: 'c', steps: ['create-team'], status: 'done' },
        { deployment: 'd', steps: ['add-reader'], status: 'failed' }
      ])
    ).toBe('2 done, 1 ok, 1 failed');
  });
});

import { isWellFormedActionId } from './server-action';

describe('isWellFormedActionId', () => {
  it('accepts an id from a real build', () => {
    expect(
      isWellFormedActionId('4083bccfbfbb05fc3a884af79bfa45a648f1cf2b61')
    ).toBe(true);
  });

  it.each([
    ['the scanner probe', 'x'],
    ['an empty header', ''],
    ['a non-hex id', 'z083bccfbfbb05fc3a884af79bfa45a648f1cf2b61'],
    ['a short id', '4083bccfbfbb05fc3a884af79bfa45a648f1cf2b6'],
    ['a long id', '4083bccfbfbb05fc3a884af79bfa45a648f1cf2b610'],
    ['padding', ' 4083bccfbfbb05fc3a884af79bfa45a648f1cf2b61']
  ])('refuses %s', (_, id) => {
    expect(isWellFormedActionId(id)).toBe(false);
  });
});

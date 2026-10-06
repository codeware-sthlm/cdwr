import {
  ACTION_NOT_FOUND_HEADER,
  isWellFormedActionId,
  reloadOnStaleAction
} from './server-action';

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

describe('reloadOnStaleAction', () => {
  let clock = 0;

  const setup = (headers: Record<string, string> = {}) => {
    clock = 1_000_000;
    const store = new Map<string, string>();
    const target = {
      // The test environment has no `Response`; only `headers.get` is read
      fetch: jest.fn<Promise<Response>, Parameters<typeof fetch>>(
        async () =>
          ({
            headers: { get: (name: string) => headers[name] ?? null }
          }) as unknown as Response
      ),
      location: { reload: jest.fn() },
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value)
      }
    };
    reloadOnStaleAction(target, () => clock);
    return target;
  };

  it('passes an ordinary response through without reloading', async () => {
    const target = setup();
    const response = await target.fetch('/admin');

    expect(response.headers.get(ACTION_NOT_FOUND_HEADER)).toBeNull();
    expect(target.location.reload).not.toHaveBeenCalled();
  });

  it('reloads once when the mismatch repeats right away', async () => {
    const target = setup({ [ACTION_NOT_FOUND_HEADER]: '1' });
    await target.fetch('/admin');
    clock += 5_000;
    await target.fetch('/admin');

    expect(target.location.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again for a later deploy', async () => {
    const target = setup({ [ACTION_NOT_FOUND_HEADER]: '1' });
    await target.fetch('/admin');
    clock += 3_600_000;
    await target.fetch('/admin');

    expect(target.location.reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload when storage throws', async () => {
    const target = setup({ [ACTION_NOT_FOUND_HEADER]: '1' });
    target.sessionStorage.getItem = () => {
      throw new Error('blocked');
    };
    await target.fetch('/admin');

    expect(target.location.reload).not.toHaveBeenCalled();
  });
});

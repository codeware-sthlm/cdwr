import { createMemoryHistory, createRouter } from '@tanstack/react-router';

import { getRouterOptions } from './router';
import { readSearchParam } from './search-param';

async function load(entry: string) {
  const router = createRouter({
    ...getRouterOptions(),
    history: createMemoryHistory({ initialEntries: [entry] })
  });
  await router.load();
  return router.state.location.searchStr;
}

describe('router search', () => {
  it('keeps a numeric looking value as written', async () => {
    const searchStr = await load('/?block=1e2');
    expect(searchStr).toContain('block=1e2');
    expect(readSearchParam(searchStr, 'block')).toBe('1e2');
  });

  it('keeps the first of a repeated key', async () => {
    const searchStr = await load('/?block=a&block=b');
    expect(readSearchParam(searchStr, 'block')).toBe('a');
  });

  it('is empty without a query', async () => {
    expect(await load('/')).toBe('');
  });
});

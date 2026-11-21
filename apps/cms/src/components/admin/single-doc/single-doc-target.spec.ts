import { type SingleDocTargetArgs, singleDocTarget } from './single-doc-target';

const base: SingleDocTargetArgs = {
  docURL: null,
  hasCreatePermission: false,
  newDocumentURL: '/admin/collections/platform-settings/create'
};

describe('singleDocTarget', () => {
  it.each<[string, Partial<SingleDocTargetArgs>, string | null]>([
    [
      'opens the existing document',
      { docURL: '/admin/collections/platform-settings/3' },
      '/admin/collections/platform-settings/3'
    ],
    [
      'prefers the document over create permission',
      {
        docURL: '/admin/collections/platform-settings/3',
        hasCreatePermission: true
      },
      '/admin/collections/platform-settings/3'
    ],
    [
      'opens the create view when none exists and creating is allowed',
      { hasCreatePermission: true },
      '/admin/collections/platform-settings/create'
    ],
    ['shows the notice when none exists and creating is denied', {}, null]
  ])('%s', (_name, overrides, expected) => {
    expect(singleDocTarget({ ...base, ...overrides })).toBe(expected);
  });
});

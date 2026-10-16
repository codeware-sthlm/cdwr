import { describe, expect, it } from 'vitest';

import { tenantSiteUrl } from './tenant-site-url';

describe('tenantSiteUrl', () => {
  it('joins the host app and the deployment on fly.dev', () => {
    expect(tenantSiteUrl('cdwr-cms', 'ada')).toBe(
      'https://cdwr-cms-ada.fly.dev'
    );
  });

  it('keeps a preview host name as it is', () => {
    expect(tenantSiteUrl('cdwr-cms-pr-12', 'ada')).toBe(
      'https://cdwr-cms-pr-12-ada.fly.dev'
    );
  });
});

import {
  parseTenantRow,
  problemsOf
} from '@codeware/shared/util/platform-problems';
import { describe, expect, it } from 'vitest';

import { freshIssue, sentry, tenant } from './fixtures';
import { problemLink } from './problem-cards';

describe('problemLink', () => {
  it('opens the new issue of a new-issue problem in Sentry', () => {
    const row = parseTenantRow(
      tenant('acme', {
        sentry: sentry({
          fresh: [freshIssue(), freshIssue({ shortId: 'CMS-13' })]
        })
      })
    );
    const [first, second] = problemsOf(row);
    expect(first && problemLink(first, row)).toEqual({
      href: 'https://cdwr.sentry.io/issues/?query=CMS-12',
      text: 'Open CMS-12 in Sentry'
    });
    expect(second && problemLink(second, row)).toEqual({
      href: 'https://cdwr.sentry.io/issues/?query=CMS-13',
      text: 'Open CMS-13 in Sentry'
    });
  });
});

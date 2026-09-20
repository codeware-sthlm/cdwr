import { enumName } from '@codeware/app-cms/util/db';
import type { Field } from 'payload';

/** The name of the visibility field */
export const visibilityName = 'visibility' as const;

/** Value that keeps a document readable by anyone */
export const visibilityPublic = 'public' as const;

/** Value that restricts a document to signed-in members of the workspace */
export const visibilityMembers = 'members' as const;

/**
 * Adds a visibility field to the sidebar.
 *
 * `public` is readable by anyone, `members` only by a signed-in user who
 * belongs to the same workspace. The default is deliberately `public`, so
 * marking something restricted is always a conscious act — but note that the
 * *reading* side must filter explicitly for the same reason: the site renders
 * as the tenant api key, which is not a member of anything.
 */
export const visibilityField = (): Field => ({
  name: visibilityName,
  type: 'select',
  enumName: enumName('content_visibility'),
  required: true,
  defaultValue: visibilityPublic,
  label: { en: 'Visibility', sv: 'Synlighet' },
  options: [
    { label: { en: 'Public', sv: 'Publik' }, value: visibilityPublic },
    {
      label: { en: 'Members only', sv: 'Endast medlemmar' },
      value: visibilityMembers
    }
  ],
  admin: {
    description: {
      en: 'Controls who can open this on the website. Choose Public to let anyone read it. Choose Members only to hide it from the public site — a visitor then has to sign in on the website, and only members of this workspace can read it. Everyone else, search engines included, never sees it.',
      sv: 'Styr vem som kan öppna innehållet på webbplatsen. Välj Publik för att låta alla läsa innehållet. Välj Endast medlemmar för att dölja innehållet från den publika webbplatsen — besökaren måste då logga in på webbplatsen, och bara medlemmar i den här arbetsytan kan läsa det. Alla andra, inklusive sökmotorer, ser det aldrig.'
    },
    position: 'sidebar'
  }
});

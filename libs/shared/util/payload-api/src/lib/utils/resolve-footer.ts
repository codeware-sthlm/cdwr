import type {
  SiteSetting,
  SiteSettingsFooterLink
} from '@codeware/shared/util/payload-types';

import type { FooterData, FooterLink, NavigationItem } from './types';

/**
 * Resolve a custom footer link into a path and a label.
 *
 * Returns `null` when the link cannot be resolved, which happens when the
 * referenced document is deleted or was fetched with insufficient depth.
 */
const resolveLink = (item: SiteSettingsFooterLink): FooterLink | null => {
  const { id, link } = item;

  let url: string;

  switch (link.type) {
    case 'reference': {
      if (!link.reference || typeof link.reference.value === 'number') {
        return null;
      }
      const { relationTo, value } = link.reference;
      if (!value.slug) {
        return null;
      }
      url =
        relationTo === 'pages'
          ? `/${value.slug}`
          : `/${relationTo}/${value.slug}`;
      break;
    }
    case 'custom': {
      if (!link.url) {
        return null;
      }
      url = link.url;
      break;
    }
    default:
      return null;
  }

  return {
    key: id ?? url,
    label: link.label,
    newTab: link.newTab ?? false,
    url
  };
};

/**
 * Resolve a privacy or terms page into a footer link.
 *
 * Returns `null` for a page that is not populated or never published, so a
 * draft starter page is not linked from every page of the site.
 */
const resolveLegalLink = (key: string, value: unknown): FooterLink | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const page = value as {
    name?: string | null;
    slug?: string | null;
    _status?: string | null;
  };

  if (!page.slug || page._status === 'draft') {
    return null;
  }

  return {
    key,
    label: page.name || page.slug,
    newTab: false,
    url: `/${page.slug}`
  };
};

/**
 * Resolve the footer from site settings data.
 *
 * Links are resolved to plain paths and the copyright to its final text, so
 * the renderer stays free of Payload document shapes. The navigation tree is
 * the link source unless the editor has picked custom links or turned links off.
 *
 * @param siteSettings - Fetched site settings document.
 * @param navigationTree - Resolved navigation tree, used as default link source.
 * @returns The footer data or `null` when there is no footer to render.
 */
export const resolveFooter = (
  siteSettings: SiteSetting | null,
  navigationTree: Array<NavigationItem>
): FooterData | null => {
  if (!siteSettings) {
    return null;
  }

  const { footer, general, legal } = siteSettings;

  // Footer is opt-out, so settings saved before the footer existed keep one
  if (footer?.enabled === false) {
    return null;
  }

  const links: Array<FooterLink> =
    footer?.linkSource === 'none'
      ? []
      : footer?.linkSource === 'custom'
        ? (footer.links ?? []).flatMap((item) => resolveLink(item) ?? [])
        : navigationTree.map(({ key, label, url }) => ({
            key,
            label,
            newTab: false,
            url
          }));

  const legalLinks = [
    resolveLegalLink('legal-privacy', legal?.privacyPage),
    resolveLegalLink('legal-terms', legal?.termsPage)
  ].flatMap((link) => link ?? []);

  // Copyright is opt-out and falls back to the application name
  const copyright =
    footer?.showCopyright === false
      ? null
      : footer?.copyright?.trim() || `© {year} ${general.appName}`;

  return {
    appName: general.appName,
    contact: footer?.contact ?? [],
    copyright,
    legalLinks,
    links,
    showVersion: footer?.showVersion ?? false,
    tagline: footer?.tagline ?? null,
    variant: footer?.variant ?? 'standard'
  };
};

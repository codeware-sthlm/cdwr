import { umamiRoot } from './umami-client';

/** The public Umami dashboard for a share slug, or null without a slug */
export const shareDashboardUrl = (
  umamiUrl: string,
  shareId: string | null | undefined
): string | null => {
  if (!shareId) {
    return null;
  }

  const root = umamiRoot(umamiUrl);
  return `${root}/share/${encodeURIComponent(shareId)}`;
};

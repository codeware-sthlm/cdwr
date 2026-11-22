/**
 * A post's date in the site's locale, as the post page and the post listing show it
 */
export function formatPostDate(dateString: string, locale: string): string {
  return new Date(dateString).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

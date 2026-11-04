/** The commit this desk was built from (`VITE_DESK_SHA`, set by `desk.yml` and `desk-image.yml`); null for a local build */
export const deskSha = (
  value: unknown = import.meta.env.VITE_DESK_SHA
): string | null =>
  typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) ? value : null;

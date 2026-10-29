/** The commit `desk.yml` built this desk from (`VITE_DESK_SHA`); null for a local build */
export const deskSha = (
  value: unknown = import.meta.env.VITE_DESK_SHA
): string | null =>
  typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) ? value : null;

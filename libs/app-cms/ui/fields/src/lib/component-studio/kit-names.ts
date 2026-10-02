let loading: Promise<string[]> | null = null;

/**
 * The names `@site/ui` exports, read from the kit itself.
 *
 * Loaded on first use, so the kit and what it pulls in stay out of the
 * admin's initial bundle. A failed load is tried again next time.
 */
export const loadKitNames = (): Promise<string[]> => {
  loading ??= import('@codeware/shared/ui/cms-renderer/site-ui')
    .then((kit) => Object.keys(kit).sort((a, b) => a.localeCompare(b)))
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
};

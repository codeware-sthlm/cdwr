import type { AboutBlock as AboutBlockProps } from '@codeware/shared/util/payload-types';

import { AppAbout } from '../../about/AppAbout';
import { usePayload } from '../../providers/PayloadProvider';

/**
 * About block — renders the running app's deployment details via the shared
 * `AppAbout` panel. App-agnostic: the build metadata comes from
 * `usePayload().appInfo`, which each app supplies with its own values.
 */
export const AboutBlock: React.FC<AboutBlockProps> = ({ heading }) => {
  const { appInfo, locale } = usePayload();

  return (
    <section className="flex flex-col gap-4">
      {heading && (
        <h2 className="text-core-headline text-2xl font-semibold tracking-tight">
          {heading}
        </h2>
      )}
      <AppAbout appInfo={appInfo} locale={locale} />
    </section>
  );
};

import { RenderLandingPage } from '@codeware/shared/ui/cms-renderer';
import type { LandingDoc } from '@codeware/shared/util/payload-utils';
import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { docHead } from '../doc-head';
import type { Site } from '../server/load-site';

export const Route = createFileRoute('/')({
  head: ({ matches }) => {
    const root = matches[0]?.loaderData as Site | undefined;
    const landing: LandingDoc | null =
      root?.ok && root.landingDocJson ? JSON.parse(root.landingDocJson) : null;

    return docHead(root, { doc: landing, landing: true });
  },
  component: Home
});

const rootRoute = getRouteApi('__root__');

function Home() {
  const data = rootRoute.useLoaderData();

  if (!data.ok) {
    return null;
  }

  const landingDoc: LandingDoc | null = data.landingDocJson
    ? JSON.parse(data.landingDocJson)
    : null;

  return (
    <RenderLandingPage
      landingPage={landingDoc?.doc}
      locale={data.site.locale}
      blocksData={landingDoc?.blocksData}
    />
  );
}

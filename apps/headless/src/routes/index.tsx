import { RenderLandingPage } from '@codeware/shared/ui/cms-renderer';
import type { LandingDoc } from '@codeware/shared/util/payload-utils';
import { createFileRoute, getRouteApi } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
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

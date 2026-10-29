import { RenderDoc } from '@codeware/shared/ui/cms-renderer';
import type { DocData } from '@codeware/shared/util/payload-utils';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { docHead } from '../doc-head';
import { loadDoc } from '../server/load-doc';
import type { Site } from '../server/load-site';

/** Pages, posts and tours: the path says which, the cms says whether it exists */
export const Route = createFileRoute('/$')({
  loader: async ({ params, parentMatchPromise }) => {
    const root = (await parentMatchPromise).loaderData;
    const result = await loadDoc({
      data: {
        splat: params._splat ?? '',
        locale: root?.ok ? root.site.locale : 'en'
      }
    });
    if (result.ok && !result.docJson) {
      // Answers 404 on the server render, and renders the not-found component
      throw notFound();
    }
    return result;
  },
  head: ({ loaderData, matches }) =>
    docHead(matches[0]?.loaderData as Site | undefined, {
      doc:
        loaderData?.ok && loaderData.docJson
          ? (JSON.parse(loaderData.docJson) as DocData)
          : null
    }),
  component: Doc
});

function Doc() {
  const data = Route.useLoaderData();

  if (!data.ok) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center p-8">
        <p role="alert">{data.message}</p>
      </main>
    );
  }

  const doc: DocData = JSON.parse(data.docJson as string);

  return <RenderDoc {...doc} />;
}

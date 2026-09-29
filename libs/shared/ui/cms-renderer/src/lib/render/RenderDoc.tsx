import type { DocData } from '@codeware/shared/util/payload-utils';

import { RenderPage } from './RenderPage';
import { RenderPost } from './RenderPost';
import { RenderTour } from './RenderTour';

/**
 * Renders a document from any collection a dynamic route serves.
 *
 * Composes the dedicated renderers rather than replacing them — apps with a
 * route per collection keep calling those directly.
 */
export function RenderDoc(data: DocData) {
  switch (data.collection) {
    case 'pages':
      return <RenderPage page={data.doc} blocksData={data.blocksData} />;
    case 'posts':
      // Which page lists the posts is not part of the document's data
      return <RenderPost post={data.doc} listingPath={null} />;
    case 'tours':
      return <RenderTour tour={data.doc} />;
    default: {
      // A renderable collection with no branch above fails the build here
      const unrendered: never = data;
      return unrendered;
    }
  }
}

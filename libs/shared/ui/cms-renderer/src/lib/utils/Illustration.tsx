import { sanitizeSvg } from '@codeware/shared/util/pure';

/**
 * A block's drawing, set inline so its theme colours resolve against the page.
 *
 * Sanitised here as well as on save, so markup that reached the database some
 * other way is held to the same rules. The drawing states its own label.
 */
export function Illustration({ svg }: { svg: string }) {
  return (
    <div
      className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }}
    />
  );
}

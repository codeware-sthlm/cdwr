import { sanitizeSvg } from '@codeware/shared/util/pure';

type InlineIconProps = {
  size: number;
} & (
  | {
      /**
       * Raw SVG markup to render as an inline icon.
       * The code is sanitized to prevent XSS attacks.
       */
      svgCode: string;
      src?: never;
    }
  | {
      /**
       * URL of the image to render as an inline icon.
       */
      src: string;
      svgCode?: never;
    }
);

/**
 * Renders a sized icon from either raw SVG markup or an image URL.
 *
 * SVG markup is sanitized to prevent XSS attacks.
 */
export function InlineIcon({ size, svgCode, src }: InlineIconProps) {
  if (svgCode) {
    return (
      // The markup's own width and height would overflow the box
      <span
        className="[&>svg]:size-full"
        style={{
          display: 'inline-flex',
          width: size,
          height: size,
          verticalAlign: 'middle',
          flexShrink: 0
        }}
        dangerouslySetInnerHTML={{ __html: sanitizeSvg(svgCode) }}
      />
    );
  }

  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      className="object-contain"
    />
  );
}

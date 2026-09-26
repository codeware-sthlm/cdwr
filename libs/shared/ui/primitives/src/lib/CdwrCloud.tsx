import { cdwrCloudSvg } from '@codeware/shared/util/ui';

// Kept exported from here as well, where every caller already reaches for it
export { cdwrCloudSvg };

const VIEW_BOX_WIDTH = 10.583617;
const VIEW_BOX_HEIGHT = 7.4375901;
const ASPECT_RATIO = VIEW_BOX_WIDTH / VIEW_BOX_HEIGHT;

/**
 * React component for the Codeware Cloud logo.
 *
 * Change the color by wrapping the component with the color to apply.
 *
 * @example
 * <div className="text-amber-400">
 *   <CdwrCloud />
 * </div>
 */
export const CdwrCloud = ({ size = 100 }) => (
  <span
    style={{
      display: 'inline-block',
      width: size,
      height: size / ASPECT_RATIO
    }}
    dangerouslySetInnerHTML={{ __html: cdwrCloudSvg }}
  />
);

export default CdwrCloud;

'use client';

import type { SocialMediaBlock as SocialMediaBlockProps } from '@codeware/shared/util/payload-types';

import { SocialLinks } from '../../social/SocialLinks';

/**
 * Render social media links in a flex layout.
 *
 * @see {@link SocialLinks} for the rendering details.
 */
export const SocialMediaBlock: React.FC<SocialMediaBlockProps> = ({
  direction,
  social
}) => {
  if (!social) {
    return null;
  }

  return <SocialLinks direction={direction} links={social} />;
};

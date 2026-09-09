import type { Media } from '@codeware/shared/util/payload-types';

/**
 * Where the gallery's example images live.
 *
 * The seed bucket, which is the platform's own storage rather than a
 * placeholder service — so the showpiece does not depend on a third party
 * staying up, and the images are the same ones the seed already ships.
 *
 * Absolute on purpose: `ImageBlock` passes an `http` url straight through,
 * which is what lets the same example render in Storybook, in Chromatic and on
 * a tenant site without each one needing the files served locally.
 *
 * Kept in one place so the project reference is a single line to change if the
 * bucket ever moves.
 */
const SEED_BUCKET =
  'https://tiuqdqnfadzjngucaatb.supabase.co/storage/v1/object/public/seed';

/**
 * A media document as the renderer receives one.
 *
 * Cast because a real `Media` carries the upload fields Payload fills in — id,
 * sizes, timestamps — and an example needs none of them to draw.
 */
export const galleryMedia = (
  file: string,
  alt: string,
  width: number,
  height: number
): Media =>
  ({
    id: file,
    alt,
    url: `${SEED_BUCKET}/${file}`,
    width,
    height,
    mimeType: 'image/jpeg',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z'
  }) as unknown as Media;

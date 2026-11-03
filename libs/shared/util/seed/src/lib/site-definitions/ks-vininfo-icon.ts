/**
 * The grape pin: a map pin whose head holds a grape, with a stem, a leaf
 * cutting into the pin and a tendril curling off it.
 *
 * One colour, `currentColor`, so the mark follows the text wherever it is
 * drawn: the header, the footer and the admin. The grape is a hole cut from the
 * pin with `fill-rule="evenodd"` rather than a disc of background colour, which
 * would be wrong on every surface but one. The leaf's outline and the tendril's
 * halo are the cuts the design draws in the background colour; they take the
 * content background with white as the fallback for a surface that lacks it.
 */
export const ksVininfoIconSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">' +
  '<g transform="translate(4.32 6.15) scale(0.82)">' +
  '<path fill="currentColor" fill-rule="evenodd" d="M24 46s-16-15-16-27a16 16 0 0 1 32 0c0 12-16 27-16 27zM31.5 19a7.5 7.5 0 1 1-15 0a7.5 7.5 0 1 1 15 0z"/>' +
  '<g transform="translate(0 -1.5)">' +
  '<path d="M22.5 3.5C20 1 17.5 -2.5 13.8 -2.8c-3.2-.2-4.2 3.2-1.9 4.2s3.4-1.6 1.6-2.7" stroke="var(--core-background-content, #fff)" stroke-width="5.7" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M22.5 3.5C20 1 17.5 -2.5 13.8 -2.8c-3.2-.2-4.2 3.2-1.9 4.2s3.4-1.6 1.6-2.7" stroke="currentColor" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</g>' +
  '<path d="M24 7V-0.5" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>' +
  '<path transform="translate(25.5 8.5) scale(1.4)" d="M0 0c1.5-4.5 6.5-6.5 12-5.5-1.5 4.5-6.5 6.5-12 5.5z" fill="currentColor" stroke="var(--core-background-content, #fff)" stroke-width="1.43" stroke-linejoin="round"/>' +
  '</g>' +
  '</svg>';

/**
 * What the showcase needs drawn, and how to ask for it.
 *
 * Committed rather than typed at a prompt: a prompt that produced a good image
 * is worth more than the image, and the only way to get a second one in the
 * same register is to still have the words. Editing this file and rerunning is
 * the whole workflow.
 *
 * The models worth reaching for are listed here as well, but which one runs is
 * asked at run time — see `MODELS` below.
 */

export type ShowcaseShot = {
  /** Becomes the file name, and the key it is uploaded under */
  name: string;
  /** Where it lands, so a reviewer can judge it against its slot */
  usedBy: string;
  prompt: string;
  /** Replicate wants this as a string ratio, not pixels */
  aspectRatio: '16:9' | '3:2' | '4:3' | '1:1';
};

/** A Replicate model reference, `owner/name` or `owner/name:version`. */
export type ModelChoice = {
  id: string;
  label: string;
  hint: string;
};

/** Chosen when the wanted model is not in the list below. */
export const CUSTOM_MODEL = 'custom';

/**
 * The models worth reaching for, best first.
 *
 * Chosen at run time rather than edited here, because switching is the loop:
 * try a prompt on the cheap tier, then run it properly. Having to edit a file
 * to do that is what makes people skip the cheap step.
 *
 * Pinning `owner/name:version` makes a rerun reproducible; leaving the version
 * off follows the model's latest, which is convenient while exploring and a
 * liability once a set has been approved.
 */
export const MODELS: Array<ModelChoice> = [
  {
    id: 'google/nano-banana-2',
    label: 'nano-banana-2',
    hint: 'Clearly the best of these on this subject matter'
  },
  {
    id: 'black-forest-labs/flux-schnell',
    label: 'flux-schnell — draft',
    hint: 'Two cents for the whole list. Not worth judging on quality, only on whether a prompt is pointed the right way'
  },
  {
    id: 'black-forest-labs/flux-1.1-pro-ultra',
    label: 'flux-1.1-pro-ultra',
    hint: 'The best flux tier, if a subject suits it better'
  },
  {
    id: CUSTOM_MODEL,
    label: 'something else…',
    hint: 'Type any owner/name or owner/name:version — these models turn over faster than this list does'
  }
];

/**
 * The theme: light in a material.
 *
 * Things that carry, split or scatter light themselves — fibre, edge-lit
 * acrylic, dichroic film, woven mesh. Anything added here stays in that family,
 * because the family is what makes a later batch look related rather than
 * freshly rolled.
 *
 * **Say what the thing is and stop.** This preamble has been rewritten four
 * times and every rewrite that added a rule made the output worse: negative
 * space gave empty frames, fifteen stacked instructions gave rubbish, and the
 * staging notes — a workbench, dark slate — got rendered literally and looked
 * wrong. The best images this file has produced came from short prompts.
 *
 * Two rules survive, and neither is taste. **No lettering**, because generated
 * text is gibberish and would look broken on the page. **Dark background**,
 * because with nothing shared at all the six came back in six unrelated colour
 * worlds — a daylit living room next to a cool studio fan — and a set that does
 * not hang together is no use however good its members are. Constraining the
 * ground costs the model nothing; it keeps the subject, the palette, the light
 * and the angle.
 */
export const STYLE = 'No text or lettering. Dark background.';

export const SHOTS: Array<ShowcaseShot> = [
  {
    name: 'hero',
    usedBy: 'hero block — the opening claim on cdwr.io',
    aspectRatio: '16:9',
    prompt:
      'A dense bundle of fibre-optic strands fanning outward, light travelling ' +
      'up every filament to a bright tip.'
  },
  {
    name: 'feature-section',
    usedBy: 'feature-section block — the claim with evidence beneath it',
    aspectRatio: '16:9',
    prompt:
      'A row of a dozen clear acrylic panels standing parallel, each one ' +
      'edge-lit so its rim glows.'
  },
  {
    name: 'callout',
    usedBy: 'callout block — the mid-page ask',
    aspectRatio: '3:2',
    prompt:
      'A cluster of clear acrylic rods of different lengths standing on end, ' +
      'each rod glowing where the light leaves its cut top.'
  },
  {
    name: 'image',
    usedBy: 'image block — the gallery example for a captioned figure',
    aspectRatio: '3:2',
    prompt:
      'A sheet of dichroic film, crumpled and laid flat, every fold catching a ' +
      'different colour.'
  },
  {
    name: 'media',
    usedBy:
      'media block — its story only; the block is retired and has no gallery example',
    aspectRatio: '3:2',
    prompt:
      'Fine woven steel mesh with a light source directly behind it, moire ' +
      'rippling across the weave.'
  },
  {
    name: 'testimonial-portrait',
    usedBy: 'testimonial block — the attribution portrait',
    aspectRatio: '1:1',
    prompt:
      'A fresnel lens seen face-on, its concentric rings catching light right ' +
      'across the disc.'
  }
];

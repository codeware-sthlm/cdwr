import type { CustomComponent } from '@codeware/shared/util/payload-types';
import {
  COMPONENT_HASH_PATTERN,
  componentTagName
} from '@codeware/shared/util/payload-utils';

/** A component with everything needed to put it on a page */
export type PlacedComponent = {
  tagName: string;
  hash: string;
  css: string;
};

/** Marks the script that carries a bundle, so each is added only once */
export const COMPONENT_SCRIPT_ATTRIBUTE = 'data-cdwr-component';

/**
 * The component as far as it can be rendered, or `null` when it is not
 * populated or has no usable build.
 *
 * A failed rebuild keeps the previous good bundle (the hooks clear it when the
 * slug changes, since it defines the old tag), so the hash is what makes it
 * renderable, not the build status. The code is fetched by hash, so a page
 * query is free to leave it out.
 */
export function placeComponent(
  component: number | CustomComponent | null | undefined
): PlacedComponent | null {
  if (!component || typeof component !== 'object') {
    return null;
  }

  const { hash, css } = component.build;
  if (!hash || !COMPONENT_HASH_PATTERN.test(hash)) {
    return null;
  }

  return { tagName: componentTagName(component.slug), hash, css: css ?? '' };
}

/**
 * Adds the bundle's script to the document unless the element is already
 * defined or the script is already there.
 *
 * @returns Whether a script was added
 */
export function ensureComponentScript(
  doc: Document,
  { tagName, hash }: Pick<PlacedComponent, 'tagName' | 'hash'>,
  src: string
): boolean {
  if (doc.defaultView?.customElements.get(tagName)) {
    return false;
  }
  if (doc.querySelector(`script[${COMPONENT_SCRIPT_ATTRIBUTE}="${hash}"]`)) {
    return false;
  }

  const script = doc.createElement('script');
  script.async = true;
  script.src = src;
  script.setAttribute(COMPONENT_SCRIPT_ATTRIBUTE, hash);
  doc.head.append(script);
  return true;
}

import type { CustomComponentBlock as CustomComponentBlockProps } from '@codeware/shared/util/payload-types';
import { componentBundlePath } from '@codeware/shared/util/payload-utils';
import { createElement, useEffect } from 'react';

import { usePayload } from '../../providers/PayloadProvider';

import { ensureComponentScript, placeComponent } from './custom-component';

type Props = CustomComponentBlockProps;

/**
 * Places a custom component.
 *
 * The server render carries the component's stylesheet and its empty element.
 * In the browser the shared modules are registered first, then the bundle is
 * loaded, which defines the element and mounts the component into it.
 */
export const CustomComponentBlock: React.FC<Props> = ({ component, props }) => {
  const { payloadUrl } = usePayload();
  const placed = placeComponent(component);
  const tagName = placed?.tagName;
  const hash = placed?.hash;

  useEffect(() => {
    if (!tagName || !hash) {
      return;
    }

    let cancelled = false;

    // The kit is loaded here so pages without a component never pay for it
    void import('./host').then(({ registerHostModules }) => {
      if (cancelled) {
        return;
      }
      registerHostModules();
      ensureComponentScript(
        document,
        { tagName, hash },
        `${payloadUrl}${componentBundlePath(hash)}`
      );
    });

    return () => {
      cancelled = true;
    };
  }, [tagName, hash, payloadUrl]);

  if (!placed) {
    return null;
  }

  return (
    <>
      <style href={`cdwr-component-${placed.hash}`} precedence="cdwr-component">
        {placed.css}
      </style>
      {createElement(placed.tagName, {
        // An unknown element is inline until told otherwise
        className: 'block',
        props: JSON.stringify(props ?? {}),
        suppressHydrationWarning: true
      })}
    </>
  );
};

import {
  HOST_REGISTRY_GLOBAL,
  type HostModuleSpecifier
} from '@codeware/shared/util/payload-utils';
import * as React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import * as ReactDom from 'react-dom';
import * as ReactDomClient from 'react-dom/client';

import * as siteUi from './kit';

/** One entry per host specifier, so a new one cannot go unregistered */
const modules = {
  react: React,
  'react-dom': ReactDom,
  'react-dom/client': ReactDomClient,
  'react/jsx-runtime': JsxRuntime,
  '@site/ui': siteUi
} satisfies Record<HostModuleSpecifier, object>;

type HostGlobal = typeof globalThis & {
  [HOST_REGISTRY_GLOBAL]?: Partial<Record<HostModuleSpecifier, object>>;
};

/** Fills the registry component bundles read their shared modules from */
export function registerHostModules(): void {
  const scope: HostGlobal = globalThis;
  scope[HOST_REGISTRY_GLOBAL] = modules;
}

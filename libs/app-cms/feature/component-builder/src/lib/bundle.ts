import { type Message, type Plugin, build } from 'esbuild';

import { hostShim, matchesPackage } from './host-modules';
import type { ComponentDiagnostic, HostModule } from './types';

const SOURCE_NS = 'cdwr-source';
const HOST_NS = 'cdwr-host';
const SOURCE_ID = 'cdwr:component';

const entryFor = (tagName: string): string => `
import Component from ${JSON.stringify(SOURCE_ID)};
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

class CdwrElement extends HTMLElement {
  static observedAttributes = ['props'];
  root = null;
  connectedCallback() {
    this.render();
  }
  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }
  disconnectedCallback() {
    // React removes the element mid-commit, where a root cannot unmount; a
    // move reconnects before the microtask and keeps its root
    queueMicrotask(() => {
      if (this.isConnected) return;
      this.root?.unmount();
      this.root = null;
    });
  }
  render() {
    let props = {};
    try {
      props = JSON.parse(this.getAttribute('props') || '{}');
    } catch (error) {
      console.error(${JSON.stringify(`<${tagName}> has invalid props JSON`)}, error);
    }
    this.root ??= createRoot(this);
    this.root.render(createElement(Component, props));
  }
}

if (!customElements.get(${JSON.stringify(tagName)})) {
  customElements.define(${JSON.stringify(tagName)}, CdwrElement);
}
`;

const toDiagnostic = (
  message: Message,
  severity: ComponentDiagnostic['severity']
): ComponentDiagnostic => ({
  message: message.text,
  line: message.location?.line ?? 1,
  column: (message.location?.column ?? 0) + 1,
  severity
});

const isBuildFailure = (
  error: unknown
): error is { errors: Message[]; warnings: Message[] } =>
  typeof error === 'object' && error !== null && 'errors' in error;

/** Bundles the authored source into an IIFE that registers the element. */
export const bundle = async (
  source: string,
  tagName: string,
  workspaceRoot: string,
  hostModules: Readonly<Record<string, HostModule>>,
  bundledPackages: readonly string[]
): Promise<
  { ok: true; js: string } | { ok: false; diagnostics: ComponentDiagnostic[] }
> => {
  const plugin: Plugin = {
    name: 'cdwr-component',
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        if (args.path === SOURCE_ID) {
          return { path: SOURCE_ID, namespace: SOURCE_NS };
        }
        if (Object.hasOwn(hostModules, args.path)) {
          return { path: args.path, namespace: HOST_NS };
        }
        if (
          args.namespace === SOURCE_NS &&
          !bundledPackages.some((pkg) => matchesPackage(args.path, pkg))
        ) {
          return {
            errors: [
              {
                text: `Import of "${args.path}" is not allowed in a custom component`
              }
            ]
          };
        }
        return undefined;
      });
      b.onLoad({ filter: /.*/, namespace: HOST_NS }, (args) => ({
        contents: hostShim(args.path),
        loader: 'js'
      }));
      b.onLoad({ filter: /.*/, namespace: SOURCE_NS }, () => ({
        contents: source,
        loader: 'tsx',
        resolveDir: workspaceRoot
      }));
    }
  };

  try {
    const result = await build({
      stdin: {
        contents: entryFor(tagName),
        resolveDir: workspaceRoot,
        loader: 'js'
      },
      bundle: true,
      write: false,
      outfile: 'component.js',
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      minify: true,
      treeShaking: true,
      legalComments: 'none',
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      plugins: [plugin]
    });
    const js = result.outputFiles[0]?.text;
    return js === undefined
      ? {
          ok: false,
          diagnostics: [
            {
              message: 'The bundler produced no output',
              line: 1,
              column: 1,
              severity: 'error'
            }
          ]
        }
      : { ok: true, js };
  } catch (error) {
    if (isBuildFailure(error)) {
      return {
        ok: false,
        diagnostics: error.errors.map((m) => toDiagnostic(m, 'error'))
      };
    }
    throw error;
  }
};

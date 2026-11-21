/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import { RootLayout, handleServerFunctions } from '@payloadcms/next/layouts';
import { type ServerFunctionClient, getPayload } from 'payload';
import React from 'react';

import config from '@payload-config';

import '@payloadcms/next/css';

import { dropStaleClientConfigs } from '../../utils/client-config-cache';

import { importMap } from './admin/importMap.js';
import './custom.css';

type Args = {
  children: React.ReactNode;
};

const serverFunction: ServerFunctionClient = async function (args) {
  'use server';
  return handleServerFunctions({
    ...args,
    config,
    importMap
  });
};

const Layout = async ({ children }: Args) => {
  // Not generated: drop any cached client config built before domain
  // adoption, so every language gets the live serverURL (COD-771). The same
  // getPayload call RootLayout makes, so its payload.config is the one read
  const payload = await getPayload({ config, cron: true, importMap });
  dropStaleClientConfigs(payload.config.serverURL);

  return (
    <RootLayout
      config={config}
      importMap={importMap}
      serverFunction={serverFunction}
    >
      {children}
    </RootLayout>
  );
};

export default Layout;

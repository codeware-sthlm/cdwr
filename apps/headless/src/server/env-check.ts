import { definePlugin } from 'nitro';

import { exitOnInvalidEnv } from '../env.server';

// A Nitro plugin, since the server entry is only imported on the first request
export default definePlugin(() => {
  exitOnInvalidEnv();
});

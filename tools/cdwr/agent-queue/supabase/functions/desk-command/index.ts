// Deno entry on Supabase; deployed with JWT verification off, since the desk proves itself with a device token
import { serviceKey } from '../_shared/keys.ts';

import { createHandler } from './handler.ts';

Deno.serve(
  createHandler({
    tokens: Deno.env.get('DESK_CONTROL_TOKENS'),
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
    serviceKey: serviceKey((name) => Deno.env.get(name)),
    fetch
  })
);

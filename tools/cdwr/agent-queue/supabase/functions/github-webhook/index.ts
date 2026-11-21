// Deno entry on Supabase; deployed with JWT verification off, since GitHub sends no Supabase JWT
import { serviceKey } from '../_shared/keys.ts';

import { createHandler } from './handler.ts';

Deno.serve(
  createHandler({
    secret: Deno.env.get('GITHUB_WEBHOOK_SECRET'),
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
    serviceKey: serviceKey((name) => Deno.env.get(name)),
    fetch
  })
);

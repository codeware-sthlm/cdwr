// Deno entry on Supabase; deployed with JWT verification off, since the desk proves itself with a device token
import { createHandler } from './handler.ts';

Deno.serve(
  createHandler({
    tokens: Deno.env.get('DESK_CONTROL_TOKENS'),
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    fetch
  })
);

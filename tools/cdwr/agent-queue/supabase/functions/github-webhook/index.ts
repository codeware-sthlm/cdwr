// Deno entry on Supabase; deployed with JWT verification off, since GitHub sends no Supabase JWT
import { createHandler } from './handler.ts';

Deno.serve(
  createHandler({
    secret: Deno.env.get('GITHUB_WEBHOOK_SECRET'),
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    fetch
  })
);

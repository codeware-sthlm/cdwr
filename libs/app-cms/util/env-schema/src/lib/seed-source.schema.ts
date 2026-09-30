import { z } from 'zod';

export const SeedSourceSchema = z.enum(['local', 'off'], {
  description:
    'Source of seed data: local = the static data in the repository, off = do not seed'
});

export type SeedSource = z.infer<typeof SeedSourceSchema>;

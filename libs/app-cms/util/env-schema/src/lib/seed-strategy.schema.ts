import { z } from 'zod';

export const SeedStrategySchema = z
  .enum(['delta', 'once'])
  .describe('Seed strategy: delta = only add new data, once = seed once');

export type SeedStrategy = z.infer<typeof SeedStrategySchema>;

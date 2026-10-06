import { z } from 'zod';

export const ActionOutputsSchema = z.object({
  destroyed: z.array(z.string()),
  skipped: z.array(z.string()),
  droppedDatabases: z.array(z.string()),
  skippedDatabases: z.array(z.string())
});

export type ActionOutputs = z.infer<typeof ActionOutputsSchema>;

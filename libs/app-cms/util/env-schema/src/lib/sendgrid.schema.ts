import { z } from 'zod';

export const SendGridSchema = z.object({
  SENDGRID_API_KEY: z.string().describe('SendGrid API key'),
  SENDGRID_FROM_ADDRESS: z
    .string()
    .email()
    .describe('Default from address')
    .optional()
    .or(z.literal('')),
  SENDGRID_FROM_NAME: z.string().describe('Default from name')
});

export type SendGrid = z.infer<typeof SendGridSchema>;

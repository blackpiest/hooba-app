import { z } from 'zod';

const usernameCharset = /^[a-zA-Z0-9_-]+$/;

export const bootstrapBodySchema = z.object({
  setup_token: z.string().min(16).max(256),
  server_name: z.string().trim().min(3).max(50),
  owner_username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(usernameCharset, 'Only letters, digits, underscore and hyphen'),
  owner_password: z.string().min(8).max(128),
});

export type BootstrapBodyInput = z.infer<typeof bootstrapBodySchema>;

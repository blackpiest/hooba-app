import { z } from 'zod';

const usernameCharset = /^[a-zA-Z0-9_-]+$/;

export const loginBodySchema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(256),
});

export const registerBodySchema = z.object({
  invite_code: z.string().trim().min(1).max(128),
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(usernameCharset, 'Only letters, digits, underscore and hyphen'),
  password: z.string().min(8).max(128),
});

export const refreshBodySchema = z.object({
  refresh_token: z.string().min(1).max(512),
});

export const logoutBodySchema = z.object({
  refresh_token: z.string().min(1).max(512),
});

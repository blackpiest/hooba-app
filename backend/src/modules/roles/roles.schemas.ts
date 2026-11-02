import { z } from 'zod';
import { MAX_DB_ID } from '../../core/http/params.js';

export const ROLE_NAME_MAX = 32;
export const CUSTOM_ROLES_MAX = 50;

export const roleUserBodySchema = z.object({
  user_id: z.number().int().positive().max(MAX_DB_ID),
});

const roleNameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(ROLE_NAME_MAX)
      // eslint-disable-next-line no-control-regex
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'must not contain control characters'),
  );

/** `#rrggbb`, храним в нижнем регистре; null — без цвета. */
const roleColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'must be #rrggbb')
  .transform((value) => value.toLowerCase())
  .nullable();

export const createRoleBodySchema = z.object({
  name: roleNameSchema,
  color: roleColorSchema.optional().default(null),
});

/** true — разрешено. Хранится как запреты (`deny*`). */
const rolePermissionsPatchSchema = z
  .object({
    send_messages: z.boolean().optional(),
    speak: z.boolean().optional(),
    screen_share: z.boolean().optional(),
    attach_files: z.boolean().optional(),
  })
  .strict();

export const patchRoleBodySchema = z
  .object({
    name: roleNameSchema.optional(),
    color: roleColorSchema.optional(),
    permissions: rolePermissionsPatchSchema.optional(),
    hoist: z.boolean().optional(),
    /** Значок роли (id из каталога, категория `role`); null — без значка. */
    badge_id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/).nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.color !== undefined ||
      value.permissions !== undefined ||
      value.hoist !== undefined ||
      value.badge_id !== undefined,
    { message: 'nothing to update', path: ['name'] },
  );

export const reorderRolesBodySchema = z
  .object({
    // Кастомные + OWNER и ADMIN.
    role_ids: z.array(z.number().int().positive().max(MAX_DB_ID)).max(CUSTOM_ROLES_MAX + 2),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.role_ids).size !== value.role_ids.length) {
      ctx.addIssue({ code: 'custom', message: 'role_ids must be unique', path: ['role_ids'] });
    }
  });

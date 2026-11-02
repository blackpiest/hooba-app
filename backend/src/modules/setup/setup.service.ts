import { ChannelType, Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { AppError } from '../../core/errors/app-error.js';
import { hashPassword } from '../../core/auth/password.js';
import { findUserByUsername } from '../../core/auth/username.js';
import { findSystemRole } from '../../core/auth/roles.js';

const RESERVED_USERNAMES = new Set(['admin', 'system']);

function isPrismaUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002'
  );
}

/** Публичный ответ (без входа): только факт настройки. Название и аватар сервера — только вошедшим. */
export async function getSetupStatus(): Promise<{ isBootstrapped: boolean }> {
  const row = await prisma.serverSettings.findUnique({ where: { id: 1 }, select: { isBootstrapped: true } });
  if (!row) {
    throw new AppError(
      'SERVER_MISCONFIGURED',
      500,
      'ServerSettings row missing; run pnpm prisma:seed',
    );
  }
  return { isBootstrapped: row.isBootstrapped };
}

export async function bootstrapServer(input: {
  serverName: string;
  ownerUsername: string;
  ownerPassword: string;
}): Promise<{ serverName: string; isBootstrapped: true; ownerUsername: string }> {
  const username = input.ownerUsername.trim();
  if (RESERVED_USERNAMES.has(username.toLowerCase())) {
    throw new AppError('VALIDATION_ERROR', 400, 'Username is reserved');
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const settings = await tx.serverSettings.findUnique({ where: { id: 1 } });
        if (!settings) {
          throw new AppError('SERVER_MISCONFIGURED', 500, 'ServerSettings missing');
        }
        if (settings.isBootstrapped) {
          throw new AppError('SERVER_ALREADY_BOOTSTRAPPED', 409, 'Server is already bootstrapped');
        }

        const taken = await findUserByUsername(tx, username);
        if (taken) {
          throw new AppError('USERNAME_ALREADY_EXISTS', 409, 'Username is already taken');
        }

        const ownerRole = await findSystemRole('OWNER', tx);
        if (!ownerRole) {
          throw new AppError(
            'OWNER_ROLE_MISSING',
            500,
            'OWNER role not found; run pnpm prisma:seed',
          );
        }

        const passwordHash = await hashPassword(input.ownerPassword);
        const serverName = input.serverName.trim();

        await tx.serverSettings.update({
          where: { id: 1 },
          data: {
            serverName,
            isBootstrapped: true,
          },
        });

        const user = await tx.user.create({
          data: {
            username,
            passwordHash,
            isActive: true,
          },
        });

        await tx.userRole.create({
          data: { userId: user.id, roleId: ownerRole.id },
        });

        const chGeneral = await tx.channel.create({
          data: {
            name: 'general',
            channelType: ChannelType.TEXT,
            position: 0,
            isPrivate: false,
            createdById: user.id,
          },
        });
        const chVoice = await tx.channel.create({
          data: {
            name: 'voice-lobby',
            channelType: ChannelType.VOICE,
            position: 0,
            isPrivate: false,
            createdById: user.id,
          },
        });
        await tx.channelMember.createMany({
          data: [
            { channelId: chGeneral.id, userId: user.id },
            { channelId: chVoice.id, userId: user.id },
          ],
        });

        return { serverName, isBootstrapped: true as const, ownerUsername: username };
      },
      {
        maxWait: 5000,
        timeout: 15000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  } catch (e: unknown) {
    if (e instanceof AppError) {
      throw e;
    }
    if (isPrismaUniqueViolation(e)) {
      throw new AppError('USERNAME_ALREADY_EXISTS', 409, 'Username is already taken');
    }
    throw new AppError('BOOTSTRAP_FAILED', 500, 'Bootstrap transaction failed');
  }
}

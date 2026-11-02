import { PrismaClient, RegistrationMode } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.serverSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      serverName: 'Community',
      isBootstrapped: false,
      registrationMode: RegistrationMode.INVITE_ONLY,
    },
    update: {},
  });

  // Ищем по неизменному key: имя роли редактируется, seed его не перезаписывает.
  // Не импортировать из src/ — в прод-образе есть только dist/ (зеркало: src/core/auth/roles.ts).
  const systemRoles = [
    // badgeId — значок роли из assets/avatars/catalog.json (зеркало миграции badges_titles).
    { key: 'OWNER', name: 'OWNER', color: '#f0b232', badgeId: 'founder' },
    { key: 'ADMIN', name: 'ADMIN', color: '#f23f43', badgeId: 'admin' },
    { key: 'MEMBER', name: 'Нормис', color: null, badgeId: null },
  ] as const;
  for (const [position, { key, name, color, badgeId }] of systemRoles.entries()) {
    await prisma.role.upsert({
      where: { key },
      create: { key, name, color, badgeId, isSystem: true, position },
      update: { isSystem: true },
    });
  }
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

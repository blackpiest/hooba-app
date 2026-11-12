-- Полный код приглашения в журнале модерации видел любой staff, а STAFF-коды доступны только OWNER.
-- Приводим старые записи к виду новых: "#<id> · <первые 4 символа>…".

UPDATE "ModerationLog" AS m
SET "reason" = '#' || i."id" || ' · ' || left(i."code", 4) || '…'
FROM "Invite" AS i
WHERE m."action" = 'INVITE_CREATE' AND m."reason" = i."code";

UPDATE "ModerationLog" AS m
SET "reason" = '#' || i."id" || ' · ' || left(i."code", 4) || '…' || substr(m."reason", length(i."code") + 1)
FROM "Invite" AS i
WHERE m."action" = 'INVITE_DELETE' AND left(m."reason", length(i."code")) = i."code";

-- Код, которого уже нет в таблице приглашений, просто обрезаем.
UPDATE "ModerationLog"
SET "reason" = left("reason", 4) || '…'
WHERE "action" = 'INVITE_CREATE' AND "reason" IS NOT NULL AND "reason" NOT LIKE '#%';

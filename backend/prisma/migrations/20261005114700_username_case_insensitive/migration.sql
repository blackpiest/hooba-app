-- Username identity is case-insensitive. Display spelling in "username" is unchanged.
CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    GROUP BY LOWER("username")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'case-insensitive username collision: two accounts differ only by letter case';
  END IF;
END $$;

ALTER TABLE "User" ALTER COLUMN "username" SET DATA TYPE CITEXT;

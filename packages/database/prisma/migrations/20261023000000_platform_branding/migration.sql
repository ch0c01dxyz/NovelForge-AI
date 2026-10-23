CREATE TABLE "platform_branding" (
  "id" TEXT NOT NULL DEFAULT 'platform',
  "name" TEXT NOT NULL DEFAULT 'NovelForge',
  "mark" TEXT NOT NULL DEFAULT 'N',
  "mark_color" TEXT NOT NULL DEFAULT '#1c1207',
  "version" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_branding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_branding_singleton" CHECK ("id" = 'platform'),
  CONSTRAINT "platform_branding_version" CHECK ("version" >= 0),
  CONSTRAINT "platform_branding_name" CHECK (length("name") BETWEEN 1 AND 40),
  CONSTRAINT "platform_branding_mark" CHECK (length("mark") BETWEEN 1 AND 3),
  CONSTRAINT "platform_branding_color" CHECK ("mark_color" ~ '^#[0-9a-fA-F]{6}$')
);

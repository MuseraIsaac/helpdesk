CREATE TABLE "system_setting" (
    "section"     TEXT NOT NULL,
    "data"        JSONB NOT NULL DEFAULT '{}',
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,

    CONSTRAINT "system_setting_pkey" PRIMARY KEY ("section")
);

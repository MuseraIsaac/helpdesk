CREATE TABLE "user_preference" (
    "userId"            TEXT NOT NULL,
    "jobTitle"          TEXT,
    "phone"             TEXT,
    "language"          TEXT NOT NULL DEFAULT 'en',
    "timezone"          TEXT NOT NULL DEFAULT 'UTC',
    "dateFormat"        TEXT NOT NULL DEFAULT 'MMM d, yyyy',
    "timeFormat"        TEXT NOT NULL DEFAULT '12h',
    "theme"             TEXT NOT NULL DEFAULT 'system',
    "sidebarCollapsed"  BOOLEAN NOT NULL DEFAULT false,
    "defaultDashboard"  TEXT NOT NULL DEFAULT 'overview',
    "ticketListDensity" TEXT NOT NULL DEFAULT 'comfortable',
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_preference_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

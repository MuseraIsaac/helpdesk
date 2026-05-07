-- Force-password-change flag on user.
-- When true, the user is sent through the change-password screen on next
-- sign-in. Set by admins when issuing a temporary password.
ALTER TABLE "user"
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

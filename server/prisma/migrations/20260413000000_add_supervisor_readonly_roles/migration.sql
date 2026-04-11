-- AlterEnum: add supervisor and readonly roles
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'readonly';

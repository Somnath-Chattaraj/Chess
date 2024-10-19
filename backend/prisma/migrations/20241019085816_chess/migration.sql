/*
  Warnings:

  - Added the required column `colour` to the `Games` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Colour" AS ENUM ('WHITE', 'BLACK');

-- AlterTable
ALTER TABLE "Games" ADD COLUMN     "colour" "Colour" NOT NULL;

-- CreateTable
CREATE TABLE "User" (
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Games" (
    "gamesId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moves" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Games_pkey" PRIMARY KEY ("gamesId")
);

-- CreateTable
CREATE TABLE "Moves" (
    "moveId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gamesId" TEXT NOT NULL,

    CONSTRAINT "Moves_pkey" PRIMARY KEY ("moveId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Games" ADD CONSTRAINT "Games_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moves" ADD CONSTRAINT "Moves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moves" ADD CONSTRAINT "Moves_gamesId_fkey" FOREIGN KEY ("gamesId") REFERENCES "Games"("gamesId") ON DELETE CASCADE ON UPDATE CASCADE;

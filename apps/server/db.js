const { PrismaClient } = require("@prisma/client");

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set. Prisma operations will fail.");
}

const prisma = new PrismaClient();

module.exports = {
  prisma
};

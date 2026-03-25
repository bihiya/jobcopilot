import prisma from "@/lib/prisma";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const name = String(body?.name || "").trim() || null;

    if (!validateEmail(email)) {
      return Response.json({ error: "Valid email is required" }, { status: 400 });
    }

    if (password.length < 8) {
      return Response.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (existing) {
      return Response.json({ error: "User already exists" }, { status: 409 });
    }

    const salt = randomBytes(16).toString("hex");
    const derivedKey = await scrypt(password, salt, 64);
    const passwordHash = `scrypt:${salt}:${Buffer.from(derivedKey).toString("hex")}`;
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash
      },
      select: {
        id: true,
        email: true,
        name: true
      }
    });

    return Response.json({ user }, { status: 201 });
  } catch (error) {
    console.error("POST /api/auth/register failed", error);
    return Response.json({ error: "Failed to register user" }, { status: 500 });
  }
}

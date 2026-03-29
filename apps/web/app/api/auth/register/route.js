import prisma from "@/lib/prisma";
import {
  databaseUnavailableMessage,
  isDatabaseUnreachableError
} from "@/lib/db-connection-error";
import { hashPassword } from "@/lib/password";

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const confirmPassword = String(body?.confirmPassword || "");
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

    if (password !== confirmPassword) {
      return Response.json({ error: "Passwords do not match" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (existing) {
      return Response.json({ error: "User already exists" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        emailVerified: new Date()
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
    if (isDatabaseUnreachableError(error)) {
      return Response.json({ error: databaseUnavailableMessage() }, { status: 503 });
    }
    return Response.json({ error: "Failed to register user" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorized();
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
    });

    return NextResponse.json({ profile }, { status: 200 });
  } catch (error) {
    console.error("GET /api/profile failed", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorized();
    }

    const body = await request.json();
    const phone = body.phone ?? null;
    const experience = body.experience ?? null;
    const skills = Array.isArray(body.skills) ? body.skills : body.skills ?? [];
    const resumeUrl = body.resumeUrl ?? null;

    const profile = await prisma.userProfile.upsert({
      where: { userId: session.user.id },
      update: {
        phone,
        experience,
        skills,
        resumeUrl,
      },
      create: {
        userId: session.user.id,
        phone,
        experience,
        skills,
        resumeUrl,
      },
    });

    return NextResponse.json({ profile }, { status: 200 });
  } catch (error) {
    console.error("POST /api/profile failed", error);
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }
}

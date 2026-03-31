import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function normalizeSkills(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const s = String(item || "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function strOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s || null;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorized();
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id }
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
    const skills = normalizeSkills(body.skills);
    const dateRaw = strOrNull(body.dateOfBirth);

    let dateOfBirth = null;
    if (dateRaw) {
      const d = new Date(`${dateRaw}T12:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) dateOfBirth = d;
    }

    const data = {
      phone: strOrNull(body.phone),
      dateOfBirth,
      currentLocation: strOrNull(body.currentLocation),
      currentSalary: strOrNull(body.currentSalary),
      expectedSalary: strOrNull(body.expectedSalary),
      noticePeriod: strOrNull(body.noticePeriod),
      linkedInUrl: strOrNull(body.linkedInUrl),
      portfolioUrl: strOrNull(body.portfolioUrl),
      headline: strOrNull(body.headline),
      education: strOrNull(body.education),
      experience: strOrNull(body.experience),
      skills,
      resumeUrl: strOrNull(body.resumeUrl)
    };

    const profile = await prisma.userProfile.upsert({
      where: { userId: session.user.id },
      update: data,
      create: {
        userId: session.user.id,
        ...data
      }
    });

    return NextResponse.json({ profile }, { status: 200 });
  } catch (error) {
    console.error("POST /api/profile failed", error);
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }
}

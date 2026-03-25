import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function saveProfile(formData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const skills = String(formData.get("skills") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  await prisma.userProfile.upsert({
    where: { userId: session.user.id },
    update: {
      phone: String(formData.get("phone") || "") || null,
      experience: String(formData.get("experience") || "") || null,
      skills,
      resumeUrl: String(formData.get("resumeUrl") || "") || null,
    },
    create: {
      userId: session.user.id,
      phone: String(formData.get("phone") || "") || null,
      experience: String(formData.get("experience") || "") || null,
      skills,
      resumeUrl: String(formData.get("resumeUrl") || "") || null,
    },
  });
}

export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <main style={{ maxWidth: 700, margin: "0 auto", padding: 32 }}>
        <h1>JobCopilot</h1>
        <p>Please log in to access your dashboard.</p>
        <Link href="/login">Login with Google</Link>
      </main>
    );
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: 32 }}>
      <h1>Dashboard</h1>
      <p>Signed in as {session.user.email}</p>
      <form action={saveProfile} style={{ display: "grid", gap: 12 }}>
        <label>
          Name
          <input value={session.user.name || ""} readOnly />
        </label>
        <label>
          Phone
          <input name="phone" defaultValue={profile?.phone || ""} />
        </label>
        <label>
          Experience
          <textarea name="experience" defaultValue={profile?.experience || ""} />
        </label>
        <label>
          Skills (comma-separated)
          <input
            name="skills"
            defaultValue={
              Array.isArray(profile?.skills) ? profile.skills.join(", ") : ""
            }
          />
        </label>
        <label>
          Resume URL
          <input name="resumeUrl" defaultValue={profile?.resumeUrl || ""} />
        </label>
        <button type="submit">Save profile</button>
      </form>
      <Link href="/api/auth/signout">Sign out</Link>
    </main>
  );
}

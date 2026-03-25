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
      resumeUrl: String(formData.get("resumeUrl") || "") || null
    },
    create: {
      userId: session.user.id,
      phone: String(formData.get("phone") || "") || null,
      experience: String(formData.get("experience") || "") || null,
      skills,
      resumeUrl: String(formData.get("resumeUrl") || "") || null
    }
  });
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId: session.user.id }
  });

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Profile</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/">Dashboard</Link>
          <Link href="/settings">Settings</Link>
          <a href="/api/auth/signout">Sign out</a>
        </nav>
      </header>

      <p>Manage your application autofill profile details and resume URL.</p>

      <form action={saveProfile} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>
          Name
          <input value={session.user.name || ""} readOnly />
        </label>
        <label>
          Email
          <input value={session.user.email || ""} readOnly />
        </label>
        <label>
          Phone
          <input name="phone" defaultValue={profile?.phone || ""} placeholder="+1 555 000 0000" />
        </label>
        <label>
          Experience
          <textarea
            name="experience"
            defaultValue={profile?.experience || ""}
            placeholder="Summarize years of experience and key achievements"
            rows={5}
          />
        </label>
        <label>
          Skills (comma-separated)
          <input
            name="skills"
            defaultValue={Array.isArray(profile?.skills) ? profile.skills.join(", ") : ""}
            placeholder="JavaScript, Next.js, Prisma"
          />
        </label>
        <label>
          Resume URL
          <input
            name="resumeUrl"
            defaultValue={profile?.resumeUrl || ""}
            placeholder="https://example.com/resume.pdf"
          />
        </label>
        <button type="submit">Save profile</button>
      </form>
    </main>
  );
}

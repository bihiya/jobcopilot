import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import DashboardClient from "./dashboard/dashboard-client";

export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <main style={{ maxWidth: 760, margin: "0 auto", padding: 32 }}>
        <h1>JobCopilot</h1>
        <p>Please log in to access your dashboard.</p>
        <Link href="/login">Login with Google</Link>
      </main>
    );
  }

  const jobs = await prisma.job.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 32 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Dashboard</h1>
          <p style={{ marginTop: 0 }}>Signed in as {session.user.email}</p>
        </div>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/">Dashboard</Link>
          <Link href="/profile">Profile</Link>
          <Link href="/settings">Settings</Link>
          <Link href="/api/auth/signout">Sign out</Link>
        </nav>
      </header>

      <DashboardClient initialJobs={jobs} />
    </main>
  );
}

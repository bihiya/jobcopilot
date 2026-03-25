import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { processJobFromDashboard } from "./dashboard/actions";

function badgeColor(status) {
  if (status === "applied") return "#0b6b2d";
  if (status === "ready") return "#0f4da8";
  return "#8a6400";
}

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
    take: 25
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

      <section style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>Process a job URL</h2>
        <p style={{ marginTop: 0, color: "#444" }}>
          Paste a job URL and run profile-aware mapping directly.
        </p>
        <form action={processJobFromDashboard} style={{ display: "grid", gap: 10 }}>
          <input
            name="jobUrl"
            type="url"
            required
            placeholder="https://www.linkedin.com/jobs/view/..."
            style={{ padding: "0.6rem 0.75rem" }}
          />
          <button type="submit" style={{ width: "fit-content", padding: "0.5rem 0.9rem" }}>
            Process Job
          </button>
        </form>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>Your jobs</h2>
        {jobs.length === 0 ? (
          <p>No jobs processed yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left">URL</th>
                  <th align="left">Status</th>
                  <th align="left">Match score</th>
                  <th align="left">Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} style={{ borderTop: "1px solid #eee" }}>
                    <td style={{ padding: "8px 0" }}>
                      <a href={job.url} target="_blank" rel="noreferrer">
                        {job.url}
                      </a>
                    </td>
                    <td style={{ padding: "8px 0" }}>
                      <span
                        style={{
                          color: "white",
                          backgroundColor: badgeColor(job.status),
                          borderRadius: 999,
                          padding: "2px 10px",
                          fontSize: 12,
                          textTransform: "capitalize"
                        }}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td style={{ padding: "8px 0" }}>
                      {job.matchScore ?? 0}%
                    </td>
                    <td style={{ padding: "8px 0" }}>
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

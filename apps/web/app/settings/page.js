import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 8 }}>Settings</h1>
        <p style={{ margin: 0, color: "#555" }}>
          Manage your account and session preferences.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gap: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 16,
        }}
      >
        <div>
          <h2 style={{ marginBottom: 8 }}>Account</h2>
          <p style={{ margin: 0 }}>
            <strong>Email:</strong> {session.user.email}
          </p>
          <p style={{ margin: "6px 0 0" }}>
            <strong>Name:</strong> {session.user.name || "Not set"}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/profile"
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 6,
              padding: "8px 12px",
              textDecoration: "none",
              color: "#111827",
            }}
          >
            Edit profile
          </Link>
          <a
            href="/api/auth/signout?callbackUrl=%2Flogin"
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 6,
              padding: "8px 12px",
              textDecoration: "none",
              color: "#111827",
            }}
          >
            Sign out
          </a>
        </div>
      </div>

      <nav style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <Link href="/">Dashboard</Link>
        <Link href="/profile">Profile</Link>
      </nav>
    </main>
  );
}

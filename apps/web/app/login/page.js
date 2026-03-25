import Link from "next/link";

export default function LoginPage() {
  return (
    <main style={{ maxWidth: 700, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Login</h1>
      <p>Please login with Google to continue.</p>
      <a
        href="/api/auth/signin/google?callbackUrl=%2F"
        style={{
          display: "inline-block",
          padding: "0.5rem 1rem",
          border: "1px solid #ccc",
          borderRadius: 6
        }}
      >
        Sign in with Google
      </a>
      <p style={{ marginTop: "1rem" }}>
        <Link href="/">Back to Dashboard</Link>
      </p>
    </main>
  );
}

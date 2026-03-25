"use server";

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";

export async function processJobAction(_prevState, formData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const jobUrl = String(formData.get("jobUrl") || "").trim();
  if (!jobUrl) {
    return { ok: false, message: "Job URL is required." };
  }

  let normalizedUrl;
  try {
    normalizedUrl = new URL(jobUrl).toString();
  } catch {
    return { ok: false, message: "Please enter a valid URL." };
  }

  try {
    const response = await fetch(`${SERVER_URL}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        userId: session.user.id,
        jobUrl: normalizedUrl,
        formFields: []
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        message: payload?.message || payload?.error || "Failed to process job."
      };
    }

    return {
      ok: true,
      message: "Job has been queued and processed successfully."
    };
  } catch (error) {
    return {
      ok: false,
      message: error?.message || "Unexpected error while processing job."
    };
  }
}

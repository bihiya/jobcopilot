import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  databaseUnavailableMessage,
  isDatabaseUnreachableError
} from "@/lib/db-connection-error";
import AppShell from "@/app/shared/app-shell";
import JobDiscoveryPanel from "./job-discovery-panel";

export default async function DiscoverPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  let databaseError = null;
  try {
    await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true }
    });
  } catch (error) {
    if (isDatabaseUnreachableError(error)) {
      databaseError = databaseUnavailableMessage();
    } else {
      throw error;
    }
  }

  return (
    <AppShell title="Discover jobs" subtitle="Pull listings from LinkedIn or Google using your saved search preferences.">
      <JobDiscoveryPanel databaseError={databaseError} />
    </AppShell>
  );
}

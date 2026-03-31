import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import AppShell from "@/app/shared/app-shell";
import ProfileForm from "./profile-form";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId: session.user.id }
  });

  return (
    <AppShell active="profile">
      <ProfileForm
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image
        }}
        initialProfile={profile}
      />
    </AppShell>
  );
}

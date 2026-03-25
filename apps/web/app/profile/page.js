import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import AppShell from "@/app/shared/app-shell";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography
} from "@mui/material";

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
    <AppShell active="profile">
      <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="stretch">
        <Card
          sx={{
            width: { xs: "100%", md: 280 },
            background: "linear-gradient(145deg, #6d5efc 0%, #43b5ff 100%)",
            color: "white"
          }}
        >
          <CardContent>
            <Stack spacing={2} alignItems="center">
              <Avatar src={session.user.image || undefined} sx={{ width: 84, height: 84 }} />
              <Typography variant="h6">{session.user.name || "JobCopilot User"}</Typography>
              <Typography variant="body2" sx={{ opacity: 0.9, textAlign: "center" }}>
                {session.user.email}
              </Typography>
              <Chip
                label="Profile Autofill Active"
                sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "white" }}
              />
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="h5" fontWeight={700} gutterBottom>
              Profile Details
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Manage your autofill profile details and resume URL.
            </Typography>

            <Alert severity="info" sx={{ mb: 2 }}>
              Skills should be comma-separated. Resume URL should be publicly accessible.
            </Alert>

            <Box
              component="form"
              action={saveProfile}
              sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}
            >
              <TextField label="Name" value={session.user.name || ""} InputProps={{ readOnly: true }} />
              <TextField label="Email" value={session.user.email || ""} InputProps={{ readOnly: true }} />
              <TextField
                label="Phone"
                name="phone"
                defaultValue={profile?.phone || ""}
                placeholder="+1 555 000 0000"
              />
              <TextField
                label="Resume URL"
                name="resumeUrl"
                defaultValue={profile?.resumeUrl || ""}
                placeholder="https://example.com/resume.pdf"
              />
              <TextField
                label="Skills (comma-separated)"
                name="skills"
                defaultValue={Array.isArray(profile?.skills) ? profile.skills.join(", ") : ""}
                placeholder="JavaScript, Next.js, Prisma"
                sx={{ gridColumn: "1 / -1" }}
              />
              <TextField
                label="Experience"
                name="experience"
                defaultValue={profile?.experience || ""}
                placeholder="Summarize years of experience and key achievements"
                multiline
                minRows={5}
                sx={{ gridColumn: "1 / -1" }}
              />
              <Button variant="contained" size="large" type="submit" sx={{ width: "fit-content" }}>
                Save Profile
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Stack>
    </AppShell>
  );
}

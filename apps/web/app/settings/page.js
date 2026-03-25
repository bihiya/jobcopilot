import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AppShell from "@/app/shared/app-shell";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import SettingsSuggestRoundedIcon from "@mui/icons-material/SettingsSuggestRounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <AppShell title="Settings" subtitle="Manage account and app preferences.">
      <Stack spacing={3}>
        <Box
          sx={{
            borderRadius: 3,
            p: { xs: 2, md: 3 },
            background: "linear-gradient(140deg, rgba(25,118,210,0.12), rgba(156,39,176,0.12))",
            border: "1px solid",
            borderColor: "divider"
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
            <SettingsSuggestRoundedIcon color="primary" />
            <Typography variant="h6" fontWeight={700}>
              Account snapshot
            </Typography>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Chip icon={<BadgeRoundedIcon />} label={`Name: ${session.user.name || "Not set"}`} />
            <Chip label={`Email: ${session.user.email || "Unknown"}`} />
            <Chip label={`User ID: ${session.user.id}`} />
          </Stack>
        </Box>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Button variant="contained" href="/profile">
            Edit profile
          </Button>
          <Button variant="outlined" color="error" href="/api/auth/signout?callbackUrl=%2Flogin" startIcon={<LogoutRoundedIcon />}>
            Sign out
          </Button>
        </Stack>
      </Stack>
    </AppShell>
  );
}

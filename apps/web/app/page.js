import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import DashboardClient from "./dashboard/dashboard-client";
import AppShell from "./shared/app-shell";
import { Alert, Button, Container, Stack, Typography } from "@mui/material";

export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 4, md: 8 } }}>
        <Stack spacing={2}>
          <Typography variant="h4" fontWeight={800}>
            JobCopilot
          </Typography>
          <Alert severity="info">Please log in to access your dashboard.</Alert>
          <Button href="/login" variant="contained" size="large" sx={{ alignSelf: "flex-start" }}>
            Login with Google
          </Button>
        </Stack>
      </Container>
    );
  }

  const jobs = await prisma.job.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  return (
    <AppShell title="Dashboard" subtitle={`Signed in as ${session.user.email}`}>
      <DashboardClient initialJobs={jobs} />
    </AppShell>
  );
}

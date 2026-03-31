import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  databaseUnavailableMessage,
  isDatabaseUnreachableError
} from "@/lib/db-connection-error";
import DashboardClient from "./dashboard/dashboard-client";
import AppShell from "./shared/app-shell";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  Stack,
  Typography
} from "@mui/material";
import RocketLaunchRoundedIcon from "@mui/icons-material/RocketLaunchRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import VerifiedUserRoundedIcon from "@mui/icons-material/VerifiedUserRounded";

const highlights = [
  {
    title: "AI job parsing",
    description: "Paste a posting URL and get fields extracted and prepared for autofill.",
    icon: <BoltRoundedIcon color="primary" />
  },
  {
    title: "One-click tracking",
    description: "Keep pending, ready, applying, and applied jobs in a single dashboard.",
    icon: <RocketLaunchRoundedIcon color="primary" />
  },
  {
    title: "Secure auth",
    description: "Use email/password or Google to sign in safely.",
    icon: <VerifiedUserRoundedIcon color="primary" />
  }
];

function LandingPage() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f7f9fc 0%, #eef3ff 100%)",
        display: "flex",
        alignItems: "center"
      }}
    >
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Grid container spacing={4} alignItems="center">
          <Grid size={{ xs: 12, md: 7 }}>
            <Stack spacing={2.5}>
              <Chip label="JobCopilot" color="primary" sx={{ width: "fit-content" }} />
              <Typography variant="h2" fontWeight={800} sx={{ fontSize: { xs: 38, md: 56 } }}>
                Land interviews faster with an AI copilot
              </Typography>
              <Typography color="text.secondary" sx={{ maxWidth: 640, fontSize: 18 }}>
                Built for active job seekers: collect openings, parse key details, and manage your
                applications in one clean workspace.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Button href="/signup" variant="contained" size="large">
                  Sign up
                </Button>
                <Button href="/login" variant="outlined" size="large">
                  Sign in
                </Button>
              </Stack>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <Stack spacing={2}>
              {highlights.map((item) => (
                <Card key={item.title} elevation={0} sx={{ borderRadius: 3, border: "1px solid #dde5ff" }}>
                  <CardContent>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      {item.icon}
                      <Box>
                        <Typography fontWeight={700}>{item.title}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {item.description}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) {
    return <LandingPage />;
  }

  let jobs = [];
  let databaseError = null;

  try {
    jobs = await prisma.job.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  } catch (error) {
    if (isDatabaseUnreachableError(error)) {
      databaseError = databaseUnavailableMessage();
    } else {
      throw error;
    }
  }

  return (
    <AppShell title="Dashboard" subtitle={`Signed in as ${session.user.email}`}>
      <DashboardClient initialJobs={jobs} databaseError={databaseError} />
    </AppShell>
  );
}

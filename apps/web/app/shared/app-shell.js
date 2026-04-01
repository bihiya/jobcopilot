"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Stack,
  Toolbar,
  Typography
} from "@mui/material";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import ReduxToast from "./redux-toast";

function navActive(pathname, href) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ title, subtitle, user, children }) {
  const pathname = usePathname() || "";
  return (
    <Box sx={{ minHeight: "100vh", background: "linear-gradient(180deg, #f6f8ff 0%, #f7fbff 100%)" }}>
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid",
          borderColor: "divider",
          backgroundColor: "rgba(255,255,255,0.85)"
        }}
      >
        <Toolbar sx={{ gap: 1.5, minHeight: 72 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1 }}>
            <Avatar
              sx={{
                width: 38,
                height: 38,
                bgcolor: "primary.main",
                fontSize: 14,
                fontWeight: 700
              }}
            >
              JC
            </Avatar>
            <Box>
              <Typography variant="subtitle1" sx={{ lineHeight: 1.1, fontWeight: 700 }}>
                JobCopilot
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Smart job application automation
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ display: { xs: "none", sm: "flex" } }}>
            <Button component={Link} href="/" startIcon={<DashboardRoundedIcon />} variant="text">
              Dashboard
            </Button>
            <Button component={Link} href="/profile" startIcon={<PersonRoundedIcon />} variant="text">
              Profile
            </Button>
            <Button component={Link} href="/settings" startIcon={<SettingsRoundedIcon />} variant="text">
              Settings
            </Button>
          </Stack>

          <Button
            component="a"
            href="/api/auth/signout?callbackUrl=%2Flogin"
            startIcon={<LogoutRoundedIcon />}
            variant="outlined"
            size="small"
          >
            Sign out
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
        <Stack spacing={0.75} sx={{ mb: 2.5 }}>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {title}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {subtitle}
          </Typography>
          {user?.email ? (
            <Stack direction="row" sx={{ pt: 0.5 }}>
              <Chip color="primary" variant="outlined" size="small" label={`Signed in as ${user.email}`} />
            </Stack>
          ) : null}
        </Stack>
        {children}
        <ReduxToast />
      </Container>
    </Box>
  );
}

import Link from "next/link";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Stack,
  Typography
} from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

export default function LoginPage() {
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 8 } }}>
      <Card
        elevation={6}
        sx={{
          borderRadius: 4,
          background:
            "linear-gradient(135deg, rgba(25,118,210,0.08) 0%, rgba(123,31,162,0.08) 100%)"
        }}
      >
        <CardContent sx={{ p: { xs: 3, md: 5 } }}>
          <Stack spacing={2} alignItems="flex-start">
            <Typography variant="h4" fontWeight={700}>
              Welcome back
            </Typography>
            <Typography color="text.secondary">
              Sign in with Google to access your dashboard, manage your profile,
              and process jobs.
            </Typography>
            <Button
              component="a"
              href="/api/auth/signin/google?callbackUrl=%2F"
              variant="contained"
              color="primary"
              startIcon={<GoogleIcon />}
              size="large"
            >
              Sign in with Google
            </Button>
            <Box>
              <Button
                component={Link}
                href="/"
                startIcon={<ArrowBackIcon />}
                color="secondary"
              >
                Back to Dashboard
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}

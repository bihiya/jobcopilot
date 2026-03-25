"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LoginIcon from "@mui/icons-material/Login";
import PersonAddAltRoundedIcon from "@mui/icons-material/PersonAddAltRounded";

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === "register") {
        const registerResponse = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name, password })
        });
        const registerPayload = await registerResponse.json().catch(() => ({}));

        if (!registerResponse.ok) {
          throw new Error(registerPayload?.error || "Registration failed");
        }
      }

      const signInResponse = await signIn("credentials", {
        email,
        password,
        callbackUrl: "/",
        redirect: false
      });

      if (signInResponse?.error) {
        throw new Error("Invalid email or password");
      }

      window.location.href = signInResponse?.url || "/";
    } catch (error) {
      setMessage({
        type: "error",
        text: error?.message || "Authentication failed"
      });
    } finally {
      setLoading(false);
    }
  }

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
          <Stack spacing={2}>
            <Typography variant="h4" fontWeight={700}>
              {mode === "login" ? "Welcome back" : "Create account"}
            </Typography>
            <Typography color="text.secondary">
              Use email/password or continue with Google.
            </Typography>

            {message ? (
              <Alert severity={message.type === "error" ? "error" : "success"}>
                {message.text}
              </Alert>
            ) : null}

            <Stack direction="row" spacing={1}>
              <Button
                variant={mode === "login" ? "contained" : "outlined"}
                onClick={() => setMode("login")}
                startIcon={<LoginIcon />}
              >
                Sign in
              </Button>
              <Button
                variant={mode === "register" ? "contained" : "outlined"}
                onClick={() => setMode("register")}
                startIcon={<PersonAddAltRoundedIcon />}
              >
                Register
              </Button>
            </Stack>

            <Box component="form" onSubmit={onSubmit}>
              <Stack spacing={1.5}>
                {mode === "register" ? (
                  <TextField
                    label="Full name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    fullWidth
                  />
                ) : null}
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  fullWidth
                />
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  fullWidth
                  helperText={mode === "register" ? "Minimum 8 characters" : ""}
                />
                <Button type="submit" variant="contained" disabled={loading}>
                  {loading
                    ? "Please wait..."
                    : mode === "login"
                      ? "Sign in with email"
                      : "Create account"}
                </Button>
              </Stack>
            </Box>

            <Divider>or</Divider>

            <Button
              component="a"
              href="/api/auth/signin/google?callbackUrl=%2F"
              variant="outlined"
              color="primary"
              startIcon={<GoogleIcon />}
              size="large"
            >
              Continue with Google
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

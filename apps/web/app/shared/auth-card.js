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
import MarkEmailReadRoundedIcon from "@mui/icons-material/MarkEmailReadRounded";
import LockResetRoundedIcon from "@mui/icons-material/LockResetRounded";

export default function AuthCard({ initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === "register") {
        if (password !== confirmPassword) {
          throw new Error("Password and confirm password must match");
        }
        const registerResponse = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name, password, confirmPassword })
        });
        const registerPayload = await registerResponse.json().catch(() => ({}));

        if (!registerResponse.ok) {
          throw new Error(registerPayload?.error || "Registration failed");
        }

        setMessage({
          type: "success",
          text: "Account created. Check server logs for verification token and verify your email."
        });
        setLoading(false);
        return;
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

  async function onVerifyEmail(event) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: verificationToken })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Email verification failed");
      }
      setMessage({ type: "success", text: "Email verified. You can now sign in." });
      setVerificationToken("");
      setMode("login");
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "Email verification failed" });
    } finally {
      setLoading(false);
    }
  }

  async function onForgotPassword(event) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to request password reset");
      }
      setMessage({
        type: "success",
        text: "If your email exists, a reset token was generated (see server logs)."
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error?.message || "Failed to request password reset"
      });
    } finally {
      setLoading(false);
    }
  }

  async function onResetPassword(event) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      if (newPassword !== confirmNewPassword) {
        throw new Error("New password and confirm password must match");
      }
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: resetToken,
          newPassword,
          confirmPassword: confirmNewPassword
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to reset password");
      }
      setMessage({ type: "success", text: "Password reset successful. Please sign in." });
      setResetToken("");
      setNewPassword("");
      setConfirmNewPassword("");
      setMode("login");
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "Failed to reset password" });
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
            <Typography color="text.secondary">Use email/password or continue with Google.</Typography>

            {message ? (
              <Alert severity={message.type === "error" ? "error" : "success"}>{message.text}</Alert>
            ) : null}

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
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
              <Button
                variant={mode === "verify" ? "contained" : "outlined"}
                onClick={() => setMode("verify")}
                startIcon={<MarkEmailReadRoundedIcon />}
              >
                Verify Email
              </Button>
              <Button
                variant={mode === "forgot" ? "contained" : "outlined"}
                onClick={() => setMode("forgot")}
                startIcon={<LockResetRoundedIcon />}
              >
                Reset Password
              </Button>
            </Stack>

            {(mode === "login" || mode === "register") && (
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
                  {mode === "register" ? (
                    <TextField
                      label="Confirm password"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      fullWidth
                    />
                  ) : null}
                  <Button type="submit" variant="contained" disabled={loading}>
                    {loading ? "Please wait..." : mode === "login" ? "Sign in with email" : "Create account"}
                  </Button>
                </Stack>
              </Box>
            )}

            {mode === "verify" && (
              <Box component="form" onSubmit={onVerifyEmail}>
                <Stack spacing={1.5}>
                  <TextField
                    label="Verification token"
                    value={verificationToken}
                    onChange={(event) => setVerificationToken(event.target.value)}
                    required
                    fullWidth
                    helperText="Token is logged by the server in this implementation."
                  />
                  <Button type="submit" variant="contained" disabled={loading}>
                    {loading ? "Please wait..." : "Verify email"}
                  </Button>
                </Stack>
              </Box>
            )}

            {mode === "forgot" && (
              <Stack spacing={2}>
                <Box component="form" onSubmit={onForgotPassword}>
                  <Stack spacing={1.5}>
                    <TextField
                      label="Email"
                      type="email"
                      value={forgotEmail}
                      onChange={(event) => setForgotEmail(event.target.value)}
                      required
                      fullWidth
                    />
                    <Button type="submit" variant="contained" disabled={loading}>
                      {loading ? "Please wait..." : "Request reset token"}
                    </Button>
                  </Stack>
                </Box>
                <Divider>Use reset token</Divider>
                <Box component="form" onSubmit={onResetPassword}>
                  <Stack spacing={1.5}>
                    <TextField
                      label="Reset token"
                      value={resetToken}
                      onChange={(event) => setResetToken(event.target.value)}
                      required
                      fullWidth
                    />
                    <TextField
                      label="New password"
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                      fullWidth
                    />
                    <TextField
                      label="Confirm new password"
                      type="password"
                      value={confirmNewPassword}
                      onChange={(event) => setConfirmNewPassword(event.target.value)}
                      required
                      fullWidth
                    />
                    <Button type="submit" variant="contained" disabled={loading}>
                      {loading ? "Please wait..." : "Reset password"}
                    </Button>
                  </Stack>
                </Box>
              </Stack>
            )}

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
              <Button component={Link} href="/" startIcon={<ArrowBackIcon />} color="secondary">
                Back to Home
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}

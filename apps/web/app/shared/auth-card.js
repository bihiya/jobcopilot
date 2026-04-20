"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Plus_Jakarta_Sans } from "next/font/google";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  Link as MuiLink,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap"
});

/** Pink, premium palette with soft gradients and strong contrast. */
const brand = {
  primary: "#d63384",
  primaryHover: "#b6266d",
  ink: "#311126",
  muted: "#7a4765",
  strip: "linear-gradient(115deg, #d63384 0%, #f065c2 48%, #ff8dcf 100%)",
  pageBg:
    "radial-gradient(circle at 10% 14%, rgba(255, 111, 175, 0.28) 0%, rgba(255, 111, 175, 0) 34%), radial-gradient(circle at 86% 18%, rgba(240, 101, 194, 0.22) 0%, rgba(240, 101, 194, 0) 32%), linear-gradient(180deg, #fff4fa 0%, #fff8fc 48%, #fff2f9 100%)",
  fieldFocus: "#d63384"
};

/** Main auth: sign in / sign up tabs. Secondary: forgot password. */
export default function AuthCard({ initialMode = "login" }) {
  const [flow, setFlow] = useState("main"); // main | forgot
  const [tab, setTab] = useState(initialMode === "register" ? 1 : 0);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
      if (tab === 1) {
        if (password !== confirmPassword) {
          throw new Error("Passwords must match");
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
          text: "Account created. Sign in below with the same email and password."
        });
        setTab(0);
        setConfirmPassword("");
        setName("");
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
        text: error?.message || "Something went wrong"
      });
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
        throw new Error(payload?.error || "Request failed");
      }
      setMessage({
        type: "success",
        text: "If that email exists, we sent reset instructions."
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error?.message || "Request failed"
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
        throw new Error("Passwords must match");
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
        throw new Error(payload?.error || "Reset failed");
      }
      setMessage({ type: "success", text: "Password updated. Sign in with your new password." });
      setResetToken("");
      setNewPassword("");
      setConfirmNewPassword("");
      setFlow("main");
      setTab(0);
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "Reset failed" });
    } finally {
      setLoading(false);
    }
  }

  const fieldSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: 2,
      bgcolor: "rgba(255,255,255,0.95)",
      "&:hover fieldset": { borderColor: `${brand.primary}55` },
      "&.Mui-focused fieldset": { borderColor: brand.primary, borderWidth: "2px" }
    },
    "& .MuiInputLabel-root.Mui-focused": { color: brand.primary }
  };

  return (
    <Box
      className={jakarta.className}
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: brand.pageBg,
        py: { xs: 3, sm: 5 },
        px: 2
      }}
    >
      <Container maxWidth="xs">
        <Card
          elevation={0}
          sx={{
            borderRadius: 3,
            overflow: "hidden",
            border: "1px solid rgba(214, 51, 132, 0.16)",
            boxShadow: "0 24px 48px -12px rgba(214, 51, 132, 0.22), 0 0 0 1px rgba(255,255,255,0.8) inset"
          }}
        >
          <Box
            sx={{
              background: brand.strip,
              px: { xs: 2.5, sm: 3 },
              py: { xs: 2.25, sm: 2.5 },
              color: "#fff"
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                letterSpacing: "-0.03em",
                fontSize: { xs: "1.15rem", sm: "1.35rem" }
              }}
            >
              JobCopilot
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.92, fontWeight: 500, mt: 0.25 }}>
              Your job search, made simple
            </Typography>
          </Box>

          <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
            <Stack spacing={2.5}>
              {flow === "main" && (
                <>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: brand.ink, letterSpacing: "-0.02em" }}>
                      {tab === 0 ? "Sign in" : "Create account"}
                    </Typography>
                    <Typography variant="body2" sx={{ color: brand.muted, mt: 0.5 }}>
                      {tab === 0 ? "Welcome back — pick up where you left off." : "Create your account in a moment."}
                    </Typography>
                  </Box>

                  <Tabs
                    value={tab}
                    onChange={(_, v) => {
                      setTab(v);
                      setMessage(null);
                    }}
                    variant="fullWidth"
                    sx={{
                      minHeight: 44,
                      px: 0,
                      "& .MuiTab-root": {
                        textTransform: "none",
                        fontWeight: 600,
                        fontSize: "0.95rem",
                        color: brand.muted
                      },
                      "& .Mui-selected": { color: `${brand.primary} !important` },
                      "& .MuiTabs-indicator": { height: 3, borderRadius: "3px 3px 0 0", bgcolor: brand.primary }
                    }}
                  >
                    <Tab label="Sign in" />
                    <Tab label="Create account" />
                  </Tabs>

                  {message ? (
                    <Alert severity={message.type === "error" ? "error" : "success"} sx={{ borderRadius: 2 }}>
                      {message.text}
                    </Alert>
                  ) : null}

                  <Box component="form" onSubmit={onSubmit}>
                    <Stack spacing={2} sx={fieldSx}>
                      {tab === 1 ? (
                        <TextField
                          label="Full name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          fullWidth
                          size="small"
                          autoComplete="name"
                        />
                      ) : null}
                      <TextField
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        fullWidth
                        size="small"
                        autoComplete="email"
                      />
                      <TextField
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        fullWidth
                        size="small"
                        autoComplete={tab === 0 ? "current-password" : "new-password"}
                      />
                      {tab === 1 ? (
                        <TextField
                          label="Confirm password"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          fullWidth
                          size="small"
                          autoComplete="new-password"
                        />
                      ) : null}

                      {tab === 0 ? (
                        <Box sx={{ textAlign: "right", mt: -0.5 }}>
                          <MuiLink
                            component="button"
                            type="button"
                            variant="body2"
                            onClick={() => {
                              setFlow("forgot");
                              setMessage(null);
                            }}
                            sx={{ cursor: "pointer", fontWeight: 600, color: brand.primary }}
                          >
                            Forgot password?
                          </MuiLink>
                        </Box>
                      ) : null}

                      <Button
                        type="submit"
                        variant="contained"
                        size="large"
                        fullWidth
                        disabled={loading}
                        sx={{
                          mt: 0.5,
                          py: 1.25,
                          borderRadius: 2,
                          textTransform: "none",
                          fontWeight: 700,
                          fontSize: "1rem",
                          bgcolor: brand.primary,
                          boxShadow: "0 12px 28px -8px rgba(214, 51, 132, 0.48)",
                          "&:hover": { bgcolor: brand.primaryHover }
                        }}
                      >
                        {loading ? "Please wait…" : tab === 0 ? "Sign in" : "Create account"}
                      </Button>
                    </Stack>
                  </Box>

                  <Divider sx={{ borderColor: "rgba(15, 23, 42, 0.08)" }}>
                    <Typography variant="caption" sx={{ color: brand.muted, px: 1, fontWeight: 500 }}>
                      or continue with
                    </Typography>
                  </Divider>

                  <Button
                    component="a"
                    href="/api/auth/signin/google?callbackUrl=%2F"
                    variant="outlined"
                    fullWidth
                    size="large"
                    startIcon={<GoogleIcon />}
                    sx={{
                      py: 1.1,
                      borderRadius: 2,
                      textTransform: "none",
                      fontWeight: 600,
                      borderColor: "rgba(15, 23, 42, 0.12)",
                      bgcolor: "#fff",
                      color: brand.ink,
                      "&:hover": { borderColor: brand.primary, bgcolor: "rgba(214, 51, 132, 0.04)" }
                    }}
                  >
                    Google
                  </Button>

                  <Typography variant="body2" sx={{ color: brand.muted, textAlign: "center" }}>
                    {tab === 0 ? (
                      <>
                        New here?{" "}
                        <MuiLink
                          component="button"
                          type="button"
                          variant="body2"
                          onClick={() => setTab(1)}
                          sx={{ cursor: "pointer", fontWeight: 700, color: brand.primary }}
                        >
                          Create an account
                        </MuiLink>
                      </>
                    ) : (
                      <>
                        Already have an account?{" "}
                        <MuiLink
                          component="button"
                          type="button"
                          variant="body2"
                          onClick={() => setTab(0)}
                          sx={{ cursor: "pointer", fontWeight: 700, color: brand.primary }}
                        >
                          Sign in
                        </MuiLink>
                      </>
                    )}
                  </Typography>
                </>
              )}

              {flow === "forgot" && (
                <>
                  <Button
                    type="button"
                    startIcon={<ArrowBackIcon />}
                    onClick={() => {
                      setFlow("main");
                      setMessage(null);
                    }}
                    sx={{ alignSelf: "flex-start", color: brand.muted, textTransform: "none", fontWeight: 600 }}
                  >
                    Back to sign in
                  </Button>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: brand.ink, letterSpacing: "-0.02em" }}>
                    Reset password
                  </Typography>
                  <Typography variant="body2" sx={{ color: brand.muted }}>
                    We’ll email a reset link if this address is registered.
                  </Typography>
                  {message ? (
                    <Alert severity={message.type === "error" ? "error" : "success"} sx={{ borderRadius: 2 }}>
                      {message.text}
                    </Alert>
                  ) : null}
                  <Box component="form" onSubmit={onForgotPassword}>
                    <Stack spacing={2} sx={fieldSx}>
                      <TextField
                        label="Email"
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                        fullWidth
                        size="small"
                      />
                      <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                        disabled={loading}
                        sx={{
                          py: 1.1,
                          borderRadius: 2,
                          textTransform: "none",
                          fontWeight: 700,
                          bgcolor: brand.primary,
                          "&:hover": { bgcolor: brand.primaryHover }
                        }}
                      >
                        {loading ? "Please wait…" : "Send reset link"}
                      </Button>
                    </Stack>
                  </Box>
                  <Divider sx={{ borderColor: "rgba(15, 23, 42, 0.08)" }} />
                  <Typography variant="subtitle2" sx={{ color: brand.muted, fontWeight: 600 }}>
                    Have a reset code?
                  </Typography>
                  <Box component="form" onSubmit={onResetPassword}>
                    <Stack spacing={2} sx={fieldSx}>
                      <TextField
                        label="Reset code"
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        fullWidth
                        size="small"
                      />
                      <TextField
                        label="New password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        fullWidth
                        size="small"
                      />
                      <TextField
                        label="Confirm new password"
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        fullWidth
                        size="small"
                      />
                      <Button
                        type="submit"
                        variant="outlined"
                        fullWidth
                        disabled={loading}
                        sx={{
                          py: 1.1,
                          borderRadius: 2,
                          textTransform: "none",
                          fontWeight: 600,
                          borderColor: brand.primary,
                          color: brand.primary,
                          "&:hover": { borderColor: brand.primaryHover, bgcolor: "rgba(214, 51, 132, 0.06)" }
                        }}
                      >
                        {loading ? "Please wait…" : "Set new password"}
                      </Button>
                    </Stack>
                  </Box>
                </>
              )}

              <Button
                component={Link}
                href="/"
                size="small"
                sx={{
                  alignSelf: "center",
                  color: brand.muted,
                  textTransform: "none",
                  fontWeight: 600,
                  "&:hover": { color: brand.primary }
                }}
              >
                ← Back to home
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

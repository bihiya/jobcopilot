"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import { SUGGESTED_SKILLS } from "@/lib/suggested-skills";

function formatDateInput(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function normalizeSkillsFromProfile(skills) {
  if (Array.isArray(skills)) {
    return skills.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof skills === "string" && skills.trim()) {
    return skills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function completionScore(fields) {
  const keys = [
    fields.phone,
    fields.dateOfBirth,
    fields.currentLocation,
    fields.headline,
    fields.education,
    fields.experience,
    fields.resumeUrl,
    fields.skills?.length,
    fields.linkedInUrl,
    fields.currentSalary,
    fields.expectedSalary
  ];
  const filled = keys.filter(Boolean).length;
  return Math.round((filled / keys.length) * 100);
}

export default function ProfileForm({ user, initialProfile }) {
  const fileRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);

  const initial = useMemo(() => {
    const p = initialProfile || {};
    return {
      phone: p.phone || "",
      dateOfBirth: formatDateInput(p.dateOfBirth),
      currentLocation: p.currentLocation || "",
      currentSalary: p.currentSalary || "",
      expectedSalary: p.expectedSalary || "",
      noticePeriod: p.noticePeriod || "",
      linkedInUrl: p.linkedInUrl || "",
      portfolioUrl: p.portfolioUrl || "",
      headline: p.headline || "",
      experience: p.experience || "",
      resumeUrl: p.resumeUrl || "",
      skills: normalizeSkillsFromProfile(p.skills)
    };
  }, [initialProfile]);

  const [form, setForm] = useState(initial);

  const score = useMemo(() => completionScore(form), [form]);

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  async function onUploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload/resume", {
        method: "POST",
        body
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }
      setField("resumeUrl", data.url);
      setMessage({ type: "success", text: "Resume uploaded. Save profile to keep changes." });
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Upload failed" });
    } finally {
      setUploading(false);
    }
  }

  async function onSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }
      setMessage({ type: "success", text: "Profile saved." });
      if (data.profile) {
        setForm({
          phone: data.profile.phone || "",
          dateOfBirth: formatDateInput(data.profile.dateOfBirth),
          currentLocation: data.profile.currentLocation || "",
          currentSalary: data.profile.currentSalary || "",
          expectedSalary: data.profile.expectedSalary || "",
          noticePeriod: data.profile.noticePeriod || "",
          linkedInUrl: data.profile.linkedInUrl || "",
          portfolioUrl: data.profile.portfolioUrl || "",
          headline: data.profile.headline || "",
          education: data.profile.education || "",
          experience: data.profile.experience || "",
          resumeUrl: data.profile.resumeUrl || "",
          skills: normalizeSkillsFromProfile(data.profile.skills)
        });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  const sectionTitle = (icon, title, subtitle) => (
    <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 2 }}>
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2,
          display: "grid",
          placeItems: "center",
          bgcolor: "primary.main",
          color: "primary.contrastText",
          flexShrink: 0
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
    </Stack>
  );

  return (
    <Stack direction={{ xs: "column", lg: "row" }} spacing={3} alignItems="stretch">
      <Card
        sx={{
          width: { xs: "100%", lg: 300 },
          flexShrink: 0,
          background: "linear-gradient(165deg, #0f172a 0%, #1e3a5f 48%, #0c4a6e 100%)",
          color: "common.white",
          position: "relative",
          overflow: "hidden"
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            opacity: 0.12,
            background:
              "radial-gradient(circle at 20% 20%, #38bdf8 0%, transparent 45%), radial-gradient(circle at 80% 60%, #a78bfa 0%, transparent 40%)"
          }}
        />
        <CardContent sx={{ position: "relative", zIndex: 1 }}>
          <Stack spacing={2.5} alignItems="center" textAlign="center">
            <Avatar src={user.image || undefined} sx={{ width: 92, height: 92, border: "3px solid rgba(255,255,255,0.35)" }}>
              {(user.name || user.email || "?").charAt(0).toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant="h6" fontWeight={800}>
                {user.name || "Your profile"}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.5 }}>
                {user.email}
              </Typography>
            </Box>
            <Paper
              elevation={0}
              sx={{
                width: "100%",
                p: 2,
                borderRadius: 2,
                bgcolor: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)"
              }}
            >
              <Typography variant="caption" sx={{ opacity: 0.8, letterSpacing: 0.6, fontWeight: 600 }}>
                PROFILE STRENGTH
              </Typography>
              <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 1 }}>
                <Typography variant="h3" fontWeight={800} lineHeight={1}>
                  {score}
                </Typography>
                <Typography variant="h6" sx={{ opacity: 0.8 }}>
                  %
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={score}
                sx={{
                  mt: 2,
                  height: 8,
                  borderRadius: 99,
                  bgcolor: "rgba(0,0,0,0.25)",
                  "& .MuiLinearProgress-bar": { borderRadius: 99, bgcolor: "#38bdf8" }
                }}
              />
            </Paper>
            <Chip
              icon={<WorkspacePremiumRoundedIcon sx={{ color: "inherit !important" }} />}
              label="Used for autofill on job forms"
              sx={{
                bgcolor: "rgba(255,255,255,0.12)",
                color: "common.white",
                fontWeight: 600,
                "& .MuiChip-icon": { color: "inherit" }
              }}
            />
          </Stack>
        </CardContent>
      </Card>

      <Box component="form" onSubmit={onSave} sx={{ flex: 1, minWidth: 0 }}>
        <Stack spacing={3}>
          {message ? (
            <Alert severity={message.type} onClose={() => setMessage(null)} sx={{ borderRadius: 2 }}>
              {message.text}
            </Alert>
          ) : null}

          <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
            {sectionTitle(
              <DescriptionRoundedIcon fontSize="small" />,
              "Personal & contact",
              "Basics recruiters and ATS forms ask for first."
            )}
            <Stack spacing={2} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <TextField label="Full name" value={user.name || ""} InputProps={{ readOnly: true }} fullWidth />
              <TextField label="Email" value={user.email || ""} InputProps={{ readOnly: true }} fullWidth />
              <TextField
                label="Phone"
                value={form.phone}
                onChange={(ev) => setField("phone", ev.target.value)}
                placeholder="+1 555 000 0000"
                fullWidth
              />
              <TextField
                label="Date of birth"
                type="date"
                value={form.dateOfBirth}
                onChange={(ev) => setField("dateOfBirth", ev.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="Current location"
                value={form.currentLocation}
                onChange={(ev) => setField("currentLocation", ev.target.value)}
                placeholder="City, State / Country"
                fullWidth
                sx={{ gridColumn: { xs: "1", md: "1 / -1" } }}
              />
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
            {sectionTitle(
              <LinkRoundedIcon fontSize="small" />,
              "Role & compensation",
              "Headline and salary expectations speed up screening questions."
            )}
            <Stack spacing={2} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <TextField
                label="Professional headline"
                value={form.headline}
                onChange={(ev) => setField("headline", ev.target.value)}
                placeholder="Senior Full-Stack Engineer"
                fullWidth
                sx={{ gridColumn: { xs: "1", md: "1 / -1" } }}
              />
              <TextField
                label="Current salary (gross)"
                value={form.currentSalary}
                onChange={(ev) => setField("currentSalary", ev.target.value)}
                placeholder="e.g. $120,000 USD / ₹18 LPA"
                fullWidth
              />
              <TextField
                label="Expected salary"
                value={form.expectedSalary}
                onChange={(ev) => setField("expectedSalary", ev.target.value)}
                placeholder="Target range or minimum"
                fullWidth
              />
              <TextField
                label="Notice period"
                value={form.noticePeriod}
                onChange={(ev) => setField("noticePeriod", ev.target.value)}
                placeholder="Immediate, 2 weeks, 1 month…"
                fullWidth
                sx={{ gridColumn: { xs: "1", md: "1 / -1" } }}
              />
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
            {sectionTitle(
              <LinkRoundedIcon fontSize="small" />,
              "Links",
              "LinkedIn and portfolio are copied into applications when forms ask for URLs."
            )}
            <Stack spacing={2}>
              <TextField
                label="LinkedIn URL"
                value={form.linkedInUrl}
                onChange={(ev) => setField("linkedInUrl", ev.target.value)}
                placeholder="https://linkedin.com/in/…"
                fullWidth
              />
              <TextField
                label="Portfolio / website"
                value={form.portfolioUrl}
                onChange={(ev) => setField("portfolioUrl", ev.target.value)}
                placeholder="https://…"
                fullWidth
              />
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
            {sectionTitle(
              <WorkspacePremiumRoundedIcon fontSize="small" />,
              "Skills",
              "Search suggestions or type a custom skill and press Enter. Remove chips anytime."
            )}
            <Autocomplete
              multiple
              freeSolo
              options={SUGGESTED_SKILLS}
              value={form.skills}
              onChange={(_e, value) => setField("skills", value)}
              filterSelectedOptions
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip {...getTagProps({ index })} label={option} color="primary" variant="outlined" />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Skills"
                  placeholder="Type to search or add your own…"
                  helperText="Suggestions appear as you type. Add anything missing with Enter."
                />
              )}
            />
          </Paper>

          <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
            {sectionTitle(
              <CloudUploadRoundedIcon fontSize="small" />,
              "Resume",
              "Upload to Cloudinary for a secure link, or paste a public URL."
            )}
            <Stack spacing={2}>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={onUploadFile} />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                <Button
                  variant="contained"
                  startIcon={<CloudUploadRoundedIcon />}
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700 }}
                >
                  {uploading ? "Uploading…" : "Upload PDF / Word"}
                </Button>
                {form.resumeUrl ? (
                  <Button
                    component="a"
                    href={form.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="outlined"
                    sx={{ borderRadius: 2, textTransform: "none" }}
                  >
                    Open current file
                  </Button>
                ) : null}
              </Stack>
              {uploading ? <LinearProgress sx={{ borderRadius: 1 }} /> : null}
              <Divider>or</Divider>
              <TextField
                label="Resume URL (public link)"
                value={form.resumeUrl}
                onChange={(ev) => setField("resumeUrl", ev.target.value)}
                placeholder="https://…"
                fullWidth
                helperText="If you upload a file, the URL field is filled automatically."
              />
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
            {sectionTitle(
              <DescriptionRoundedIcon fontSize="small" />,
              "Experience summary",
              "Short narrative for “Tell us about yourself” and similar fields."
            )}
            <TextField
              label="Experience"
              value={form.experience}
              onChange={(ev) => setField("experience", ev.target.value)}
              placeholder="Years of experience, domains, highlights, education…"
              multiline
              minRows={6}
              fullWidth
            />
          </Paper>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={saving}
              startIcon={<SaveRoundedIcon />}
              sx={{ borderRadius: 2, px: 3, py: 1.25, textTransform: "none", fontWeight: 800, boxShadow: 3 }}
            >
              {saving ? "Saving…" : "Save profile"}
            </Button>
            <Typography variant="body2" color="text.secondary">
              Changes apply to future job processing and autofill.
            </Typography>
          </Stack>
        </Stack>
      </Box>
    </Stack>
  );
}

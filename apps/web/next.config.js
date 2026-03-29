const path = require("path");
const { loadEnvConfig } = require("@next/env");

// Monorepo: env files live at repo root; Next.js only auto-loads from apps/web.
loadEnvConfig(path.join(__dirname, "..", ".."));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@mui/material",
    "@mui/system",
    "@mui/icons-material",
    "@mui/material-nextjs",
    "@emotion/react",
    "@emotion/styled",
    "@emotion/cache"
  ]
};

module.exports = nextConfig;

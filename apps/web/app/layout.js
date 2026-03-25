import Providers from "./providers";

export const metadata = {
  title: "JobCopilot",
  description: "Job processing assistant with profile-aware autofill"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Arial, sans-serif", margin: 0, padding: "1rem" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

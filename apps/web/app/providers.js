"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import theme from "@/lib/theme";
import { Provider as ReduxProvider } from "react-redux";
import { makeStore } from "@/lib/store";

export default function Providers({ children }) {
  const store = makeStore();

  return (
    <ReduxProvider store={store}>
      <SessionProvider>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </ThemeProvider>
      </SessionProvider>
    </ReduxProvider>
  );
}

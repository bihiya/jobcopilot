"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import theme from "@/lib/theme";
import { Provider as ReduxProvider } from "react-redux";
import { createStore } from "@/lib/store";
import { useRef } from "react";

export default function Providers({ children }) {
  const storeRef = useRef(null);
  if (!storeRef.current) {
    storeRef.current = createStore();
  }

  return (
    <ReduxProvider store={storeRef.current}>
      <SessionProvider>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </ThemeProvider>
      </SessionProvider>
    </ReduxProvider>
  );
}

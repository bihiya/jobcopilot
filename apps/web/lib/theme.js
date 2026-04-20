import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#d63384",
      light: "#ff6faf",
      dark: "#9f1f63"
    },
    secondary: {
      main: "#f065c2",
      light: "#ff99de",
      dark: "#c13a93"
    },
    success: {
      main: "#2E7D32"
    },
    warning: {
      main: "#ED6C02"
    },
    background: {
      default: "#fff1f8",
      paper: "#ffffff"
    },
    text: {
      primary: "#311126",
      secondary: "#7a4765"
    }
  },
  shape: {
    borderRadius: 16
  },
  typography: {
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    h1: {
      fontWeight: 700
    },
    h2: {
      fontWeight: 700
    }
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          border: "1px solid rgba(214, 51, 132, 0.12)",
          boxShadow: "0 18px 40px rgba(214, 51, 132, 0.14)"
        }
      }
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true
      },
      styleOverrides: {
        root: {
          borderRadius: 999,
          textTransform: "none",
          fontWeight: 700
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999
        }
      }
    }
  }
});

export default theme;

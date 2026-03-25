import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#5E35B1"
    },
    secondary: {
      main: "#00ACC1"
    },
    success: {
      main: "#2E7D32"
    },
    warning: {
      main: "#ED6C02"
    },
    background: {
      default: "#f6f7fb",
      paper: "#ffffff"
    }
  },
  shape: {
    borderRadius: 12
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
          boxShadow: "0 8px 24px rgba(16, 24, 40, 0.08)"
        }
      }
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true
      }
    }
  }
});

export default theme;

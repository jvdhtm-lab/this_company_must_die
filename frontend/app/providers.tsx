"use client";

import { ApolloProvider } from "@apollo/client/react";
import CssBaseline from "@mui/material/CssBaseline";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useState, type ReactNode } from "react";

import { createApolloClient } from "@/lib/apollo";
import { AuthProvider } from "@/lib/auth";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1f5eff",
    },
    secondary: {
      main: "#7b3ff2",
    },
    background: {
      default: "#f4f6fb",
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily:
      '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    h4: {
      fontWeight: 700,
    },
    h6: {
      fontWeight: 600,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(createApolloClient);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ApolloProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </ApolloProvider>
    </ThemeProvider>
  );
}

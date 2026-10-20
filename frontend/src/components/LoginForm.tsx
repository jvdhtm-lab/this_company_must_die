"use client";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState, type FormEvent } from "react";

import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/format";

export function LoginForm({
  title = "Sign in",
  description = "Sign in to create polls and add answer options.",
}: {
  title?: string;
  description?: string;
}) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(username, password);
      setPassword("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card variant="outlined" sx={{ maxWidth: 560 }}>
      <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
          </Box>
          <Stack
            component="form"
            spacing={2}
            onSubmit={handleSubmit}
            sx={{ maxWidth: 440 }}
          >
            <TextField
              label="Username or email"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
              fullWidth
              autoFocus
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              fullWidth
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ alignSelf: "flex-start" }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </Stack>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: "grey.50",
              border: 1,
              borderColor: "divider",
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Demo account
            </Typography>
            <Typography variant="body2">
              Username <strong>demo</strong> · Password{" "}
              <strong>demo12345</strong>
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

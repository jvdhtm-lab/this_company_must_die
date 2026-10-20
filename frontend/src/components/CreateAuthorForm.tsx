"use client";

import PersonAddAltRoundedIcon from "@mui/icons-material/PersonAddAltRounded";
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
import { resourceMutations } from "@/lib/resource-query";

export function CreateAuthorForm() {
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createAuthor = resourceMutations("author").create.include(
    "id",
    "name",
    "email",
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await createAuthor({ name: name.trim(), email: email.trim() });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card variant="outlined" sx={{ maxWidth: 680 }}>
      <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2,
                display: "grid",
                placeItems: "center",
                color: "primary.main",
                bgcolor: "primary.50",
              }}
            >
              <PersonAddAltRoundedIcon />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Create your author profile
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Polls are owned by authors. Set one up before creating a poll.
              </Typography>
            </Box>
          </Stack>
          <Stack
            component="form"
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            onSubmit={handleSubmit}
            sx={{ alignItems: { sm: "flex-start" } }}
          >
            <TextField
              label="Author name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              fullWidth
            />
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{ whiteSpace: "nowrap" }}
            >
              {loading ? "Creating…" : "Create author"}
            </Button>
          </Stack>
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

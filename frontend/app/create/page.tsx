"use client";

import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import {
  Box,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

import { AppHeader } from "@/components/AppHeader";
import { CreateAuthorForm } from "@/components/CreateAuthorForm";
import { CreatePollForm } from "@/components/CreatePollForm";
import { LoginForm } from "@/components/LoginForm";
import { useAuth } from "@/lib/auth";

export default function CreatePollPage() {
  const { user, loading } = useAuth();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppHeader />

      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <Stack spacing={3}>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, sm: 4 },
              borderRadius: 3,
              color: "common.white",
              background:
                "linear-gradient(135deg, #1f5eff 0%, #6a3df5 58%, #a638f0 100%)",
            }}
          >
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: "center" }}
            >
              <LockOutlinedIcon />
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                  Create a poll
                </Typography>
                <Typography sx={{ opacity: 0.85 }}>
                  Poll creation is restricted to signed-in users. Voting stays
                  open to everyone.
                </Typography>
              </Box>
            </Stack>
          </Paper>

          {loading ? (
            <Stack sx={{ alignItems: "center", py: 6 }}>
              <CircularProgress />
            </Stack>
          ) : !user ? (
            <LoginForm
              title="Sign in to create a poll"
              description="You need a Django account to publish polls. Demo credentials are below."
            />
          ) : !user.author ? (
            <CreateAuthorForm />
          ) : (
            <CreatePollForm authorId={user.author.id} />
          )}
        </Stack>
      </Container>
    </Box>
  );
}

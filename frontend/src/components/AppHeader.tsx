"use client";

import AddRoundedIcon from "@mui/icons-material/AddRounded";
import BallotRoundedIcon from "@mui/icons-material/BallotRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  IconButton,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import NextLink from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/lib/auth";

export function AppHeader() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "rgba(255, 255, 255, 0.9)",
        backdropFilter: "blur(14px)",
      }}
    >
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ gap: 1.5, minHeight: 72 }}>
          <Stack
            direction="row"
            spacing={1.25}
            sx={{ alignItems: "center", flexGrow: 1, minWidth: 0 }}
          >
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 2.5,
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                color: "common.white",
                background:
                  "linear-gradient(135deg, #1f5eff 0%, #6a3df5 58%, #a638f0 100%)",
              }}
            >
              <BallotRoundedIcon sx={{ fontSize: 22 }} />
            </Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 750,
                letterSpacing: "-0.02em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              This Company Must Die
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Button
              component={NextLink}
              href="/"
              color={pathname === "/" ? "primary" : "inherit"}
              sx={{ display: { xs: "none", sm: "inline-flex" } }}
            >
              Polls
            </Button>
            <Button
              component={NextLink}
              href="/create"
              variant={pathname === "/create" ? "contained" : "outlined"}
              startIcon={<AddRoundedIcon />}
              sx={{ whiteSpace: "nowrap" }}
            >
              Create poll
            </Button>

            {user ? (
              <>
                <Chip
                  avatar={
                    <Avatar
                      sx={{
                        bgcolor: "primary.main",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {user.username.charAt(0).toUpperCase()}
                    </Avatar>
                  }
                  label={user.author?.name ?? user.username}
                  variant="outlined"
                  sx={{
                    display: { xs: "none", md: "inline-flex" },
                    maxWidth: 200,
                  }}
                />
                <Button
                  color="inherit"
                  onClick={() => void logout()}
                  startIcon={<LogoutRoundedIcon />}
                  sx={{ display: { xs: "none", sm: "inline-flex" } }}
                >
                  Log out
                </Button>
                <IconButton
                  aria-label="Log out"
                  color="inherit"
                  onClick={() => void logout()}
                  sx={{ display: { xs: "inline-flex", sm: "none" } }}
                >
                  <LogoutRoundedIcon />
                </IconButton>
              </>
            ) : (
              <Button
                component={NextLink}
                href="/create"
                color="inherit"
                sx={{ display: { xs: "none", sm: "inline-flex" } }}
              >
                Sign in
              </Button>
            )}
          </Stack>
        </Toolbar>
      </Container>
    </AppBar>
  );
}

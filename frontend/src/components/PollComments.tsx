"use client";

import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import ThumbUpAltRoundedIcon from "@mui/icons-material/ThumbUpAltRounded";
import ThumbUpOffAltRoundedIcon from "@mui/icons-material/ThumbUpOffAltRounded";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState, type FormEvent } from "react";

import type { Comment } from "@/gql/schema";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/format";
import { resourceMutations, type DeepPartial } from "@/lib/resource-query";

export type CommentData = DeepPartial<Comment>;

export function PollComments({
  pollId,
  comments,
  onChanged,
}: {
  pollId: string;
  comments: CommentData[];
  onChanged: () => void | Promise<unknown>;
}) {
  const { user } = useAuth();
  const [name, setName] = useState(user?.author?.name ?? "");
  const [content, setContent] = useState("");
  const [pendingLikeId, setPendingLikeId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createComment = resourceMutations("comments").create.include("id");
  const toggleLike = resourceMutations("comments").toggle.include(
    "id",
    "likes",
    "viewerLiked",
  );

  async function handleLike(commentId: string | undefined) {
    if (!commentId || pendingLikeId) {
      return;
    }

    setPendingLikeId(commentId);
    setError(null);

    try {
      await toggleLike({ commentId });
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPendingLikeId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedContent = content.trim();

    if (!trimmedContent || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createComment({
        pollId,
        content: trimmedContent,
        authorName: name.trim() || null,
      });
      setContent("");
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box sx={{ borderTop: 1, borderColor: "divider", pt: 2.5 }}>
      <Stack
        direction="row"
        spacing={0.75}
        sx={{ alignItems: "center", mb: 1.5 }}
      >
        <ChatBubbleOutlineRoundedIcon
          sx={{ fontSize: 18, color: "text.secondary" }}
        />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Top comments
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {comments.length} of 3
        </Typography>
      </Stack>

      {comments.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No comments yet. Say what everyone is thinking.
        </Typography>
      ) : (
        <Stack spacing={1.25} sx={{ mb: 2 }}>
          {comments.map((comment) => {
            const isLiked = Boolean(comment.viewerLiked);
            const isPending = pendingLikeId === comment.id;

            return (
              <Box
                key={comment.id}
                sx={{
                  display: "flex",
                  gap: 1.25,
                  alignItems: "flex-start",
                  p: 1.25,
                  borderRadius: 2,
                  bgcolor: "grey.50",
                }}
              >
                <Avatar
                  sx={{
                    width: 30,
                    height: 30,
                    fontSize: 13,
                    fontWeight: 700,
                    bgcolor: "secondary.main",
                  }}
                >
                  {(comment.authorName ?? "A").charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, color: "text.primary" }}
                  >
                    {comment.authorName ?? "Anonymous"}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ mt: 0.25, wordBreak: "break-word" }}
                  >
                    {comment.content}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  color={isLiked ? "primary" : "inherit"}
                  disabled={isPending}
                  aria-label={`Like comment by ${comment.authorName ?? "Anonymous"}`}
                  onClick={() => void handleLike(comment.id)}
                  startIcon={
                    isLiked ? (
                      <ThumbUpAltRoundedIcon />
                    ) : (
                      <ThumbUpOffAltRoundedIcon />
                    )
                  }
                  sx={{ flexShrink: 0, minWidth: 0, px: 1 }}
                >
                  {comment.likes ?? 0}
                </Button>
              </Box>
            );
          })}
        </Stack>
      )}

      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={1.25}>
          <TextField
            label="Your name"
            placeholder="Anonymous"
            value={name}
            onChange={(event) => setName(event.target.value)}
            size="small"
            fullWidth
          />
          <TextField
            label="Add a comment"
            placeholder="Which company should go?"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            size="small"
            fullWidth
            multiline
            minRows={2}
          />
          <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
            <Button
              type="submit"
              variant="outlined"
              size="small"
              startIcon={<SendRoundedIcon />}
              disabled={submitting || !content.trim()}
            >
              {submitting ? "Posting..." : "Post comment"}
            </Button>
          </Stack>
        </Stack>
      </Box>

      {error ? (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      ) : null}
    </Box>
  );
}

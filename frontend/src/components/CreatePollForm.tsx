"use client";

import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { errorMessage } from "@/lib/format";
import { resourceMutations } from "@/lib/resource-query";

const MAX_OPTIONS = 10;

export function CreatePollForm({ authorId }: { authorId: string }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [pubDate, setPubDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createPoll = resourceMutations("polls").create.include("id");

  function updateOption(index: number, value: string) {
    setOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? value : option,
      ),
    );
  }

  function addOption() {
    setOptions((current) =>
      current.length >= MAX_OPTIONS ? current : [...current, ""],
    );
  }

  function removeOption(index: number) {
    setOptions((current) =>
      current.length <= 2
        ? current
        : current.filter((_, optionIndex) => optionIndex !== index),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    const cleanedOptions = options
      .map((option) => option.trim())
      .filter(Boolean);

    if (cleanedOptions.length < 2) {
      setError("Add at least two answer options.");
      return;
    }

    if (cleanedOptions.length !== options.length) {
      setError("Answer options cannot be blank.");
      return;
    }

    if (new Set(cleanedOptions.map((option) => option.toLowerCase())).size !== cleanedOptions.length) {
      setError("Answer options must be unique.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await createPoll({
        question: trimmedQuestion,
        pubDate: pubDate
          ? new Date(pubDate).toISOString()
          : new Date().toISOString(),
        authorId,
        choices: cleanedOptions,
      });

      if (result.data?.id) {
        router.push("/");
        router.refresh();
      } else {
        setError("The poll could not be created.");
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card variant="outlined" sx={{ maxWidth: 760 }}>
      <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Create a poll
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Ask the company a question and give everyone a few options.
            </Typography>
          </Box>

          <Stack
            component="form"
            spacing={2.5}
            onSubmit={handleSubmit}
          >
            <TextField
              label="Question"
              placeholder="What should we do next?"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              required
              fullWidth
            />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Answer options
              </Typography>
              <Stack spacing={1.25}>
                {options.map((option, index) => (
                  <Stack
                    key={index}
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center" }}
                  >
                    <TextField
                      label={`Option ${index + 1}`}
                      placeholder={
                        index === 0
                          ? "First answer"
                          : index === 1
                            ? "Second answer"
                            : "Another answer"
                      }
                      value={option}
                      onChange={(event) =>
                        updateOption(index, event.target.value)
                      }
                      required
                      fullWidth
                      size="small"
                    />
                    <IconButton
                      aria-label={`Remove option ${index + 1}`}
                      onClick={() => removeOption(index)}
                      disabled={options.length <= 2}
                    >
                      <DeleteOutlineRoundedIcon />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
              <Button
                type="button"
                startIcon={<AddRoundedIcon />}
                onClick={addOption}
                disabled={options.length >= MAX_OPTIONS}
                sx={{ mt: 1 }}
              >
                Add option
              </Button>
            </Box>

            <TextField
              label="Publish date"
              type="datetime-local"
              value={pubDate}
              onChange={(event) => setPubDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="Leave blank to publish immediately."
              sx={{ maxWidth: 300 }}
            />

            <Divider />

            <Stack
              direction={{ xs: "column-reverse", sm: "row" }}
              spacing={1.5}
              sx={{ alignItems: { sm: "center" } }}
            >
              <Button
                component={NextLink}
                href="/"
                color="inherit"
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                size="large"
                startIcon={<AddRoundedIcon />}
                disabled={loading}
              >
                {loading ? "Publishing…" : "Publish poll"}
              </Button>
            </Stack>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

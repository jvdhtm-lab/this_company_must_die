export function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return `${value.replace("T", " ").slice(0, 16)} UTC`;
}

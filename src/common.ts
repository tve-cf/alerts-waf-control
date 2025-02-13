export function handleError(
  error: string | { message: string } | Error | undefined | null,
  defaultMessage: string
) {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === "string") {
    return error;
  } else if (error && typeof error === "object" && "message" in error) {
    return error.message;
  }

  return defaultMessage;
}

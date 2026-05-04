import axios from "axios";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface ErrorAlertProps {
  /** Direct message string to display. */
  message?: string;
  /** Error object — if an Axios error, the server message is extracted automatically. */
  error?: Error | null;
  /** Fallback message when `error` doesn't contain a server message. */
  fallback?: string;
  className?: string;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    // Server may return { error: "..." } or { message: "..." }
    if (typeof data?.error   === "string") return data.error;
    if (typeof data?.message === "string") return data.message;
    // Network error (no response)
    if (error.message) return error.message;
  }
  return fallback;
}

export default function ErrorAlert({
  message,
  error,
  fallback = "Something went wrong",
  className,
}: ErrorAlertProps) {
  // Render nothing when there's nothing to show. Without this guard the
  // fallback text leaks into the UI on every consumer that does
  // `<ErrorAlert error={mutation.error} />` (e.g. dialogs that mount
  // before any submission has happened) — turning every freshly-opened
  // form into "Failed to …" before the user has typed anything.
  if (!message && (error == null)) return null;

  const text = message ?? getErrorMessage(error, fallback);

  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

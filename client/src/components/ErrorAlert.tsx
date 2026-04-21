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
  const text = message ?? getErrorMessage(error, fallback);

  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

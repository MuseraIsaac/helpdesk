import { useState } from "react";
import { Link, useLocation } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { forgetPassword } from "@/lib/auth-client";
import { useBranding } from "@/lib/useBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Mail, ArrowLeft, ChevronRight, MailCheck,
  HeadphonesIcon, ShieldCheck,
} from "lucide-react";

const schema = z.object({
  email: z.email("Please enter a valid email"),
});
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const location = useLocation();
  const isPortal = location.pathname.startsWith("/portal");
  const { data: branding } = useBranding();

  const companyName = branding?.companyName || "Zentra";
  const logoDataUrl = branding?.logoDataUrl;
  const loginPath = isPortal ? "/portal/login" : "/login";

  const accent = isPortal
    ? { bg: "bg-emerald-700 hover:bg-emerald-800", text: "text-emerald-700 dark:text-emerald-400", glow: "0 4px 16px rgba(5,150,105,0.35)" }
    : { bg: "bg-indigo-700 hover:bg-indigo-800", text: "text-indigo-700 dark:text-indigo-400", glow: "0 4px 16px rgba(79,70,229,0.35)" };

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const origin = window.location.origin;
      // Pass redirectTo so Better Auth bakes the right return URL into the token.
      // The server's sendResetPassword override rebuilds the link to point at
      // /reset-password with the token preserved.
      await forgetPassword({
        email: data.email,
        redirectTo: `${origin}/reset-password`,
      });
    },
    onSuccess: () => setSubmittedEmail(getValues("email")),
  });

  // Always show a generic success state — never reveal whether an email is
  // registered. Better Auth itself returns 200 for unknown emails.
  const submitted = submittedEmail !== null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.06),transparent)] pointer-events-none" />

      <div className="w-full max-w-[400px] relative z-10">
        <div className="flex items-center gap-2.5 mb-10">
          {logoDataUrl ? (
            <img src={logoDataUrl} alt={companyName} className="h-9 w-9 rounded-xl object-contain" />
          ) : (
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${isPortal ? "bg-emerald-600" : "bg-indigo-600"}`}>
              <HeadphonesIcon className="h-5 w-5 text-white" />
            </div>
          )}
          <span className="font-bold text-lg tracking-tight">{companyName}</span>
        </div>

        <Link
          to={loginPath}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to sign in
        </Link>

        {!submitted ? (
          <>
            <div className="mb-7">
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                Forgot your password?
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                Enter the email tied to your account and we'll send you a link to reset it.
              </p>
            </div>

            <form
              onSubmit={handleSubmit((d) => mutation.mutate(d))}
              noValidate
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="pl-10 h-11 bg-muted/30 border-border/60 focus:bg-background transition-colors"
                    {...register("email")}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <span>•</span> {errors.email.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                size="lg"
                className={`w-full h-11 font-semibold gap-2 mt-2 text-white ${accent.bg}`}
                disabled={mutation.isPending}
                style={!mutation.isPending ? { boxShadow: accent.glow } : undefined}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending reset link…
                  </>
                ) : (
                  <>
                    Send reset link
                    <ChevronRight className="h-4 w-4 opacity-70" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 pt-5 border-t border-border/40 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/60">
              <ShieldCheck className="h-3 w-3" />
              <span>Reset links expire in 1 hour and can only be used once.</span>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card p-7 shadow-sm">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <MailCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground text-center">
              Check your inbox
            </h1>
            <p className="text-sm text-muted-foreground mt-2 text-center leading-relaxed">
              If an account exists for{" "}
              <span className="font-medium text-foreground">{submittedEmail}</span>, we've sent a
              link to reset your password. The link expires in 1 hour.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-4 text-center">
              Didn't get it? Check spam, then{" "}
              <button
                type="button"
                onClick={() => {
                  setSubmittedEmail(null);
                  mutation.reset();
                }}
                className={`font-semibold hover:underline ${accent.text}`}
              >
                try again
              </button>
              .
            </p>

            <Link
              to={loginPath}
              className="mt-6 block text-center text-sm font-semibold text-foreground hover:underline"
            >
              Return to sign in
            </Link>
          </div>
        )}
      </div>

      <p className="absolute bottom-6 text-[11px] text-muted-foreground/40">
        {companyName} {isPortal ? "· Customer Support Portal" : ""}
      </p>
    </div>
  );
}

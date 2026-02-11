import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn, useSession } from "../lib/auth-client";

const loginSchema = z.object({
  email: z.email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-gray-500">
        Loading...
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (data: LoginFormData) => {
    setServerError("");

    const { error } = await signIn.email(data);

    if (error) {
      setServerError(error.message ?? "Login failed");
      return;
    }

    navigate("/", { replace: true });
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white rounded-lg shadow-md p-10 w-full max-w-[400px]">
        <h1 className="text-2xl font-bold mb-1">Helpdesk</h1>
        <p className="text-gray-500 mb-6">Sign in to your account</p>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {serverError && (
            <div className="bg-red-50 text-red-600 border border-red-200 rounded-md px-3 py-2.5 text-sm mb-4">
              {serverError}
            </div>
          )}
          <label htmlFor="email" className="block text-sm font-medium mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            className={`w-full px-3 py-2.5 border rounded-md text-[15px] mb-4 transition-colors outline-none focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15 ${
              errors.email
                ? "border-red-600 focus:border-red-600 focus:ring-red-600/15"
                : "border-gray-300"
            }`}
            placeholder="admin@example.com"
            {...register("email")}
          />
          {errors.email && (
            <div className="text-red-600 text-[13px] -mt-3 mb-4">
              {errors.email.message}
            </div>
          )}
          <label
            htmlFor="password"
            className="block text-sm font-medium mb-1.5"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            className={`w-full px-3 py-2.5 border rounded-md text-[15px] mb-4 transition-colors outline-none focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15 ${
              errors.password
                ? "border-red-600 focus:border-red-600 focus:ring-red-600/15"
                : "border-gray-300"
            }`}
            placeholder="Enter your password"
            {...register("password")}
          />
          {errors.password && (
            <div className="text-red-600 text-[13px] -mt-3 mb-4">
              {errors.password.message}
            </div>
          )}
          <button
            className="w-full py-2.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

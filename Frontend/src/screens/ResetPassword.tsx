"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { verifyPasswordResetToken, resetPassword } from "@/src/lib/auth-api";
import { ApiError } from "@/src/lib/api-client";

function ResetPasswordForm() {
  const router = useRouter();
  const token = router.isReady ? (router.query.token as string) : null;

  const [status, setStatus] = useState<"checking" | "valid" | "invalid" | "success">("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) {
      setStatus("invalid");
      return;
    }

    let isMounted = true;
    verifyPasswordResetToken(token)
      .then((res) => {
        if (isMounted) {
          if (res.valid) {
            setStatus("valid");
          } else {
            setStatus("invalid");
          }
        }
      })
      .catch(() => {
        if (isMounted) setStatus("invalid");
      });

    return () => {
      isMounted = false;
    };
  }, [token, router.isReady]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || !token) return;

    setLoading(true);
    setError("");
    setFieldError("");

    try {
      await resetPassword({ token, newPassword: password });
      setStatus("success");
      // Optionally redirect after a few seconds
      setTimeout(() => {
        router.push("/auth/login");
      }, 3000);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.details?.fieldErrors?.newPassword) {
        setFieldError(err.details.fieldErrors.newPassword[0]);
      } else if (err instanceof ApiError) {
        setError(err.message || "This reset link is invalid or has expired.");
        setStatus("invalid");
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (status === "checking") {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-8">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Verifying secure link...</p>
      </div>
    );
  }

  if (status === "invalid" || error && status !== "valid") {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <CardTitle className="text-2xl font-serif">Invalid Link</CardTitle>
        <CardDescription className="text-base">
          {error || "This reset link is invalid or has expired. Please request a new one."}
        </CardDescription>
        <Button className="w-full h-11 mt-4" onClick={() => router.push("/forgot-password")}>
          Request new link
        </Button>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="space-y-6 text-center py-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <CardTitle className="text-2xl font-serif">Password Reset Successfully</CardTitle>
        <CardDescription className="text-base pb-4">
          Your password has been updated. You can now log in with your new password.
        </CardDescription>
        <Button className="w-full h-11" onClick={() => router.push("/auth/login")}>
          Go to login
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-4">
          <Lock className="w-6 h-6" />
        </div>
        <CardTitle className="text-2xl font-serif">Set New Password</CardTitle>
        <CardDescription>
          Please enter your new password below. It must be at least 8 characters long and contain at least one digit.
        </CardDescription>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New strong password"
            className="h-11"
            required
            disabled={loading}
            minLength={8}
          />
          {fieldError && <p className="text-xs text-destructive">{fieldError}</p>}
        </div>
        
        <Button type="submit" className="w-full h-11" disabled={loading}>
          {loading ? "Updating..." : "Reset password"}
        </Button>
      </form>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-none shadow-xl bg-card/80 backdrop-blur-xl">
        <CardContent className="pt-6">
          <ResetPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}

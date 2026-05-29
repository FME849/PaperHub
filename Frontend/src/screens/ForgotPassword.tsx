"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, CheckCircle2 } from "lucide-react";
import { useAppState } from "@/src/state/AppStateContext";

export default function ForgotPassword() {
  const router = useRouter();
  const { requestPasswordReset } = useAppState();
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const result = await requestPasswordReset(email);
      if (result) {
        setSuccess(true);
      } else {
        setError("Unable to process your request at this time.");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-none shadow-xl bg-card/80 backdrop-blur-xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-4">
            {success ? <CheckCircle2 className="w-6 h-6" /> : <Mail className="w-6 h-6" />}
          </div>
          <CardTitle className="text-2xl font-serif">
            {success ? "Check your email" : "Forgot Password"}
          </CardTitle>
          <CardDescription>
            {success
              ? `We've sent a password reset link to ${email}.`
              : "Enter your email address and we'll send you a link to reset your password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!success ? (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11"
                required
                disabled={loading}
              />
              {error && <p className="text-xs text-destructive text-center">{error}</p>}
              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? "Sending link..." : "Send reset link"}
              </Button>
              <Button type="button" variant="ghost" className="w-full h-11" onClick={() => router.push("/auth/login")} disabled={loading}>
                Back to login
              </Button>
              <div className="text-center text-xs text-muted-foreground mt-4">
                New here? <Link href="/auth/register" className="text-primary hover:underline">Create account</Link>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <Button type="button" className="w-full h-11" onClick={() => router.push("/auth/login")}>
                Return to login
              </Button>
              <div className="text-center text-xs text-muted-foreground mt-4">
                Didn't receive the email?{" "}
                <button 
                  onClick={() => setSuccess(false)} 
                  className="text-primary hover:underline bg-transparent border-none p-0 cursor-pointer"
                >
                  Click to try again
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

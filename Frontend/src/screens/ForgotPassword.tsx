"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail } from "lucide-react";
import { useAppState } from "@/src/state/AppStateContext";

export default function ForgotPassword() {
  const router = useRouter();
  const { requestPasswordReset } = useAppState();
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void requestPasswordReset;
    setError("Password reset is not supported by the backend in this release.");
    setSuccess(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-none shadow-xl bg-card/80 backdrop-blur-xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-4">
            <Mail className="w-6 h-6" />
          </div>
          <CardTitle className="text-2xl font-serif">Forgot Password</CardTitle>
          <CardDescription>
            Password reset is not available yet. Use your existing password or contact your team admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-11"
              required
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            {success && <p className="text-xs text-emerald-600">Reset email sent (mock).</p>}
            <Button type="submit" className="w-full h-11" disabled>
              Send reset link (coming soon)
            </Button>
            <Button type="button" variant="ghost" className="w-full h-11" onClick={() => router.push("/auth/login")}>
              Back to login
            </Button>
            <div className="text-center text-xs text-muted-foreground">
              New here? <Link href="/auth/register" className="text-primary hover:underline">Create account</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

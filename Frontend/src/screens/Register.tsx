"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { useAppState } from "@/src/state/AppStateContext";
import { ApiError, fieldError } from "@/src/lib/api-client";
import {
  isValidDisplayName,
  isValidEmail,
  isValidPassword,
  passwordHint,
} from "@/src/lib/validation";

export default function Register() {
  const router = useRouter();
  const { register } = useAppState();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isValidDisplayName(fullName)) {
      setError("Display name must be 1–80 characters.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!isValidPassword(password)) {
      setError(passwordHint());
      return;
    }

    setSubmitting(true);
    try {
      await register(fullName, email, password);
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError(err.message);
        } else if (err.status === 400) {
          setError(
            fieldError(err.details, "email") ??
              fieldError(err.details, "password") ??
              fieldError(err.details, "displayName") ??
              err.message,
          );
        } else {
          setError("Something went wrong. Please try again.");
        }
      } else {
        setError("Cannot reach the API. Is the backend running?");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="min-h-screen flex items-center justify-center bg-background px-4 w-full"
    >
      <div className="w-full max-w-md">
        <motion.div className="flex justify-center mb-8">
          <motion.div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground shadow-lg">
            <Sparkles className="w-7 h-7" />
          </motion.div>
        </motion.div>

        <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-xl">
          <CardHeader className="space-y-1 text-center pb-8">
            <CardTitle className="text-3xl font-serif font-bold tracking-tight">Join PaperHub</CardTitle>
            <CardDescription className="text-muted-foreground">
              Create an account to save favorites and sync your profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-5">
              <motion.div className="space-y-2">
                <label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground px-1">
                  Display name
                </label>
                <Input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ada Lovelace"
                  className="h-12 rounded-xl bg-secondary/50 border-none px-4"
                  required
                  autoComplete="name"
                />
              </motion.div>
              <motion.div className="space-y-2">
                <label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground px-1">
                  Email
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  className="h-12 rounded-xl bg-secondary/50 border-none px-4"
                  required
                  autoComplete="email"
                />
              </motion.div>
              <motion.div className="space-y-2">
                <label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground px-1">
                  Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 rounded-xl bg-secondary/50 border-none px-4"
                  required
                  autoComplete="new-password"
                />
              </motion.div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-12 rounded-xl text-sm font-semibold tracking-wide bg-primary shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
              >
                {submitting ? "Creating account…" : "Create Account"}
              </Button>
            </form>
          </CardContent>
          <motion.div className="h-[1px] bg-border/30 mx-auto w-[85%]" />
          <CardFooter className="flex justify-center py-6">
            <p className="text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/auth/login"
                className="font-bold text-primary hover:underline underline-offset-4"
              >
                Sign in here
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </motion.div>
  );
}

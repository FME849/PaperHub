"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useAppState } from "@/src/state/AppStateContext";

export default function Register() {
  const router = useRouter();
  const { register } = useAppState();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (fullName.trim().length < 2 || !email.includes("@") || password.length < 6) {
      setError("Please complete all fields with valid values.");
      return;
    }
    register(fullName, email);
    router.push("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="flex justify-center mb-8">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground shadow-lg">
                <Sparkles className="w-7 h-7" />
            </div>
        </div>

        <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-xl">
          <CardHeader className="space-y-1 text-center pb-8">
            <CardTitle className="text-3xl font-serif font-bold tracking-tight">Join ArxivScope</CardTitle>
            <CardDescription className="text-muted-foreground">
              Begin your journey into deep research intelligence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground px-1">Full Name</label>
                <Input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Julian Vance" className="h-12 rounded-xl bg-secondary/50 border-none px-4" required />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground px-1">Email Address</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="julian.vance@stanford.edu" className="h-12 rounded-xl bg-secondary/50 border-none px-4" required />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground px-1">Password</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="h-12 rounded-xl bg-secondary/50 border-none px-4" required />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button type="submit" className="w-full h-12 rounded-xl text-sm font-semibold tracking-wide bg-primary shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
                Create Account
              </Button>
            </form>
          </CardContent>
          <div className="h-[1px] bg-border/30 mx-auto w-[85%]" />
          <CardFooter className="flex justify-center py-6">
            <p className="text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link href="/auth/login" className="font-bold text-primary hover:underline underline-offset-4">Sign in here</Link>
            </p>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}

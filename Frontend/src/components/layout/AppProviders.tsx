"use client";

import React from "react";
import Head from "next/head";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppStateProvider } from "@/src/state/AppStateContext";

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AppStateProvider>
      <Head>
        <title>Paper Hub - Intelligent Academic Workspace</title>
        <meta name="description" content="Curated intelligence across your tracked academic domains. Fresh insights, summarized for efficiency." />
      </Head>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </AppStateProvider>
  );
}

"use client";

import React from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppStateProvider } from "@/src/state/AppStateContext";

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AppStateProvider>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </AppStateProvider>
  );
}

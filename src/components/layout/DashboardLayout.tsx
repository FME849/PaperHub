"use client";

import React from "react";
import Sidebar from "@/src/components/layout/Sidebar";
import Header from "@/src/components/layout/Header";
import { useAppState } from "@/src/state/AppStateContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { auth, isHydrated } = useAppState();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !auth.isAuthenticated) {
      router.push("/auth/login");
    }
  }, [auth.isAuthenticated, isHydrated, router]);

  if (!isHydrated || !auth.isAuthenticated) return null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto p-6 md:p-10">{children}</main>
      </div>
    </div>
  );
}

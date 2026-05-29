"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  BookOpen, 
  Hash, 
  Star, 
  BarChart3, 
  LayoutDashboard, 
  Settings,
  LogOut,
  LogIn
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppState } from '@/src/state/AppStateContext';

const navItems = [
  { icon: LayoutDashboard, label: 'Feed', href: '/' },
  { icon: Hash, label: 'Topics', href: '/topics' },
  { icon: Star, label: 'Favorites', href: '/favorites' },
  { icon: BarChart3, label: 'Statistics', href: '/statistics' },
  { icon: Settings, label: 'Profile', href: '/profile' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const currentPath = pathname ?? "/";
  const { auth, logout } = useAppState();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace("/auth/login");
  };

  const isActive = (href: string) => {
    if (href === "/") return currentPath === "/";
    return currentPath.startsWith(href);
  };

  return (
    <aside className="hidden md:flex w-64 flex-col border-r bg-card h-screen sticky top-0">
      <Link href="/" className="p-6 flex items-center gap-3 hover:opacity-80 transition-opacity">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
          <BookOpen className="w-5 h-5" />
        </div>
        <span className="font-serif font-bold text-xl tracking-tight">Paper Hub</span>
      </Link>
      
      <nav className="flex-1 px-4 space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-4">
          Academic Workspace
        </div>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 group text-sm",
              isActive(item.href)
                ? "bg-secondary text-primary font-medium" 
                : "text-muted-foreground hover:text-primary hover:bg-secondary/50"
            )}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t space-y-1">
        {auth.isAuthenticated ? (
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        ) : (
          <button
            type="button"
            onClick={() => router.push("/auth/login")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 text-sm transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Login
          </button>
        )}
      </div>
    </aside>
  );
}

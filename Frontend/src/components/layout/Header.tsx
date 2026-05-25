"use client";

import { Bell, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuGroup,
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAppState } from '@/src/state/AppStateContext';
import { useRouter } from 'next/navigation';

export default function Header() {
  const {
    notifications,
    searchQuery,
    setSearchQuery,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    auth,
    papers,
  } = useAppState();
  const unreadCount = notifications.filter(n => !n.isRead).length;
  const router = useRouter();

  return (
    <header className="h-16 border-b bg-background/50 backdrop-blur-md sticky top-0 z-10 px-6 flex items-center justify-between">
      <div className="flex-1 max-w-xl relative group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <Input 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search papers, authors, or research topics..." 
          className="pl-10 bg-secondary/50 border-none focus-visible:ring-1 focus-visible:ring-primary/20 transition-all rounded-full"
        />
      </div>

      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full relative h-9 w-9 inline-flex items-center justify-center hover:bg-secondary transition-colors">
            <Bell className="w-5 h-5 text-muted-foreground" />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full border-2 border-background" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[320px]">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>Notifications</span>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => markAllNotificationsAsRead()}>
                  Mark all read
                </Button>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifications.length === 0 ? (
                <DropdownMenuItem disabled>No notifications yet</DropdownMenuItem>
              ) : (
                notifications.slice(0, 6).map((notification) => (
                  <DropdownMenuItem
                    key={notification.id}
                    className="block cursor-pointer"
                    onClick={() => {
                      markNotificationAsRead(notification.id);
                      
                      const isMockId = (id?: string) => {
                        if (!id) return true;
                        return id.includes(".") || ["1706.03762", "2005.14165", "1601.00001", "2304.02643"].includes(id);
                      };

                      // Check if notification points to a valid paper loaded in state
                      if (notification.paperId && !isMockId(notification.paperId) && papers.some((p) => p.id === notification.paperId)) {
                        router.push(`/papers/${notification.paperId}`);
                      } else {
                        // Fallback: Find a real paper matching the notification's topic keywords
                        const realPapers = papers.filter((p) => !isMockId(p.id));
                        const matchedPaper = realPapers.find((p) => {
                          const topic = p.topics[0]?.toLowerCase() || "";
                          return (
                            notification.message.toLowerCase().includes(topic) ||
                            notification.title.toLowerCase().includes(topic)
                          );
                        }) || realPapers[0] || papers.find((p) => !isMockId(p.id)) || papers[0];
                        
                        if (matchedPaper) {
                          router.push(`/papers/${matchedPaper.id}`);
                        }
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">{notification.title}</div>
                        <div className="text-xs text-muted-foreground">{notification.message}</div>
                      </div>
                      {!notification.isRead && <Badge className="text-[9px]">new</Badge>}
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-3 border-l pl-4 ml-4">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium">{auth.user?.name ?? "Guest User"}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest">{auth.user?.email ?? "Not signed in"}</div>
          </div>
          <Avatar className="w-9 h-9 border ring-2 ring-background ring-offset-2 ring-primary/5 cursor-pointer" onClick={() => router.push("/profile")}>
            <AvatarImage src="https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=100" />
            <AvatarFallback>JV</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}

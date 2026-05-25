"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { MOCK_NOTIFICATIONS, MOCK_PAPERS, MOCK_TOPICS } from "@/src/mockData";
import { loginUser, logoutUser, registerUser } from "@/src/lib/auth-api";
import { ApiError, setUnauthorizedHandler, tokenStore } from "@/src/lib/api-client";
import { addFavorite, listFavorites, removeFavorite } from "@/src/lib/favorites-api";
import { getCurrentUser } from "@/src/lib/users-api";
import { apiUserToUser } from "@/src/lib/user-mapper";
import { isValidPaperId } from "@/src/lib/validation";
import { Notification, Paper, Topic, User } from "@/src/types";
import { listTopics, createTopic, updateTopic, deleteTopic as apiDeleteTopic, listTopicPapers } from "@/src/lib/topics-api";

type SortMode = "newest" | "score";

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
}

interface AppStateContextValue {
  papers: Paper[];
  topics: Topic[];
  notifications: Notification[];
  auth: AuthState;
  favoriteIds: Set<string>;
  searchQuery: string;
  selectedTopic: string | null;
  favoritesOnly: boolean;
  similarOnly: boolean;
  sortMode: SortMode;
  isHydrated: boolean;
  authLoading: boolean;
  setSearchQuery: (value: string) => void;
  setSelectedTopic: (topic: string | null) => void;
  setFavoritesOnly: (value: boolean) => void;
  setSimilarOnly: (value: boolean) => void;
  setSortMode: (mode: SortMode) => void;
  addTopic: (name: string) => void | Promise<void>;
  editTopic: (id: string, name: string) => void | Promise<void>;
  deleteTopic: (id: string) => void | Promise<void>;
  toggleFavorite: (paperId: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<boolean>;
  fetchNewPapers: () => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
}

interface PersistedState {
  papers: Paper[];
  topics: Topic[];
  notifications: Notification[];
}

const STORAGE_KEY = "arxivscope-frontend-state-v2";

const AppStateContext = createContext<AppStateContextValue | null>(null);

function applyFavoriteIds(papers: Paper[], favoriteIds: Set<string>): Paper[] {
  return papers.map((paper) => ({
    ...paper,
    isBookmarked: favoriteIds.has(paper.id),
  }));
}

function buildMockPaper(topics: Topic[]): Paper {
  const fallbackTopic = topics[0]?.name ?? "General AI";
  const chosenTopic = topics[Math.floor(Math.random() * topics.length)]?.name ?? fallbackTopic;
  const now = new Date();
  const suffix = Math.random().toString(36).slice(2, 7);
  const title = `New Insights in ${chosenTopic} (${now.getFullYear()})`;
  return {
    id: `2401.${suffix}`,
    title,
    authors: ["Auto Curator", "Paper Hub Bot"],
    publishDate: now.toISOString().slice(0, 10),
    sourceUrl: "https://arxiv.org",
    abstract: `This is a mocked newly fetched paper in ${chosenTopic}.`,
    summary: `Auto-generated summary for a newly fetched paper related to ${chosenTopic}.`,
    topics: [chosenTopic],
    isBookmarked: false,
    readabilityScore: Math.floor(Math.random() * 25) + 70,
    impactFactor: Number((Math.random() * 3 + 7).toFixed(1)),
    isSimilar: Math.random() > 0.6,
  };
}

function getSourceFiltersForTopic(name: string): string[] {
  const lower = name.toLowerCase().trim();
  if (lower.includes("physics")) {
    return ["arxiv:physics.gen-ph", "arxiv:physics.app-ph", "arxiv:physics.comp-ph"];
  }
  if (lower.includes("math")) {
    return ["arxiv:math.GM", "arxiv:math.MP", "arxiv:math.CO"];
  }
  if (lower.includes("economics") || lower.includes("finance") || lower.includes("economy")) {
    return ["arxiv:econ.GN", "arxiv:q-fin.GN"];
  }
  if (lower.includes("biology") || lower.includes("bio")) {
    return ["arxiv:q-bio.OT", "arxiv:q-bio.NC"];
  }
  // Default to general CS / AI / Machine Learning
  return ["arxiv:cs.AI", "arxiv:cs.LG", "arxiv:cs.CV"];
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [papers, setPapers] = useState<Paper[]>(MOCK_PAPERS);
  const [topics, setTopics] = useState<Topic[]>(MOCK_TOPICS);
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false, user: null });
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [similarOnly, setSimilarOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [isHydrated, setIsHydrated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const syncFavoritesToPapers = useCallback((ids: Set<string>) => {
    setFavoriteIds(ids);
    setPapers((current) => applyFavoriteIds(current, ids));
  }, []);

  const loadFavorites = useCallback(async () => {
    const { favorites } = await listFavorites();
    syncFavoritesToPapers(new Set(favorites.map((f) => f.paperId)));
  }, [syncFavoritesToPapers]);

  const loadTopics = useCallback(async () => {
    try {
      const { items } = await listTopics();
      const topicsWithCounts = await Promise.all(
        items.map(async (apiTopic) => {
          try {
            const res = await listTopicPapers(apiTopic.id);
            return {
              id: apiTopic.id,
              name: apiTopic.name,
              count: res.totalCount !== undefined ? res.totalCount : (res.items?.length || 0),
            };
          } catch {
            return {
              id: apiTopic.id,
              name: apiTopic.name,
              count: 0,
            };
          }
        })
      );
      setTopics(topicsWithCounts);
    } catch (err) {
      console.error("Failed to load topics:", err);
    }
  }, []);

  const establishSession = useCallback(
    async (token: string, user: User) => {
      tokenStore.set(token);
      setAuth({ isAuthenticated: true, user });
      await Promise.all([loadFavorites(), loadTopics()]);
    },
    [loadFavorites, loadTopics],
  );

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setAuth({ isAuthenticated: false, user: null });
    syncFavoritesToPapers(new Set());
    setTopics(MOCK_TOPICS);
  }, [syncFavoritesToPapers]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      router.replace("/auth/login");
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession, router]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const persisted = JSON.parse(raw) as PersistedState;
        if (persisted.papers?.length) setPapers(persisted.papers);
        if (persisted.topics?.length) setTopics(persisted.topics);
        if (persisted.notifications?.length) setNotifications(persisted.notifications);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    let cancelled = false;
    (async () => {
      const token = tokenStore.get();
      if (!token) {
        if (!cancelled) setAuthLoading(false);
        return;
      }
      try {
        const apiUser = await getCurrentUser();
        if (cancelled) return;
        setAuth({ isAuthenticated: true, user: apiUserToUser(apiUser) });
        await Promise.all([loadFavorites(), loadTopics()]);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isHydrated, loadFavorites, loadTopics, clearSession]);

  useEffect(() => {
    if (!isHydrated) return;
    const persisted: PersistedState = { papers, topics, notifications };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  }, [papers, topics, notifications, isHydrated]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { user, token } = await loginUser({
        email: email.trim(),
        password,
      });
      await establishSession(token, apiUserToUser(user));
    },
    [establishSession],
  );

  const register = useCallback(
    async (displayName: string, email: string, password: string) => {
      const trimmedName = displayName.trim();
      const { user, token } = await registerUser({
        email: email.trim(),
        password,
        displayName: trimmedName || undefined,
      });
      await establishSession(token, apiUserToUser(user));
    },
    [establishSession],
  );

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch {
      // Logout is idempotent; always clear local session.
    }
    clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const apiUser = await getCurrentUser();
    setAuth({ isAuthenticated: true, user: apiUserToUser(apiUser) });
  }, []);

  const toggleFavorite = useCallback(
    async (paperId: string) => {
      if (!auth.isAuthenticated) return;
      if (!isValidPaperId(paperId)) return;

      const wasBookmarked = favoriteIds.has(paperId);
      const previousIds = new Set(favoriteIds);
      const nextIds = new Set(favoriteIds);
      if (wasBookmarked) {
        nextIds.delete(paperId);
      } else {
        nextIds.add(paperId);
      }
      syncFavoritesToPapers(nextIds);

      try {
        if (wasBookmarked) {
          await removeFavorite(paperId);
        } else {
          await addFavorite(paperId);
        }
      } catch {
        syncFavoritesToPapers(previousIds);
        throw new Error("Could not update favorite. Please try again.");
      }
    },
    [auth.isAuthenticated, favoriteIds, syncFavoritesToPapers],
  );

  const value = useMemo<AppStateContextValue>(
    () => ({
      papers,
      topics,
      notifications,
      auth,
      favoriteIds,
      searchQuery,
      selectedTopic,
      favoritesOnly,
      similarOnly,
      sortMode,
      isHydrated,
      authLoading,
      setSearchQuery,
      setSelectedTopic,
      setFavoritesOnly,
      setSimilarOnly,
      setSortMode,
      addTopic: async (name: string) => {
        const trimmed = name.trim();
        if (!trimmed || !auth.isAuthenticated) return;
        try {
          const apiTopic = await createTopic({
            name: trimmed,
            keywords: [trimmed],
            sourceFilters: getSourceFiltersForTopic(trimmed),
          });
          setTopics((current) => [
            ...current,
            { id: apiTopic.id, name: apiTopic.name, count: 0 },
          ]);
        } catch (err) {
          throw err;
        }
      },
      editTopic: async (id: string, name: string) => {
        const trimmed = name.trim();
        if (!trimmed || !auth.isAuthenticated) return;
        try {
          const apiTopic = await updateTopic(id, { name: trimmed });
          setTopics((current) =>
            current.map((topic) => (topic.id === id ? { ...topic, name: apiTopic.name } : topic)),
          );
        } catch (err) {
          throw err;
        }
      },
      deleteTopic: async (id: string) => {
        if (!auth.isAuthenticated) return;
        try {
          await apiDeleteTopic(id);
          setTopics((current) => current.filter((topic) => topic.id !== id));
        } catch (err) {
          throw err;
        }
      },
      toggleFavorite,
      login,
      register,
      logout,
      refreshUser,
      requestPasswordReset: async (email: string) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return true;
      },
      fetchNewPapers: () => {
        const paper = buildMockPaper(topics);
        setPapers((current) => applyFavoriteIds([paper, ...current], favoriteIds));
        setTopics((current) =>
          current.map((topic) =>
            paper.topics.includes(topic.name) ? { ...topic, count: topic.count + 1 } : topic,
          ),
        );
        setNotifications((current) => [
          {
            id: `notif-${Date.now()}`,
            title: "New paper fetched",
            message: `"${paper.title}" was added to your feed.`,
            date: "just now",
            isRead: false,
            type: "new_paper",
            paperId: paper.id,
          },
          ...current,
        ]);
      },
      markNotificationAsRead: (id: string) => {
        setNotifications((current) =>
          current.map((notif) => (notif.id === id ? { ...notif, isRead: true } : notif)),
        );
      },
      markAllNotificationsAsRead: () => {
        setNotifications((current) => current.map((notif) => ({ ...notif, isRead: true })));
      },
    }),
    [
      papers,
      topics,
      notifications,
      auth,
      favoriteIds,
      searchQuery,
      selectedTopic,
      favoritesOnly,
      similarOnly,
      sortMode,
      isHydrated,
      authLoading,
      toggleFavorite,
      login,
      register,
      logout,
      refreshUser,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used inside AppStateProvider.");
  }
  return context;
}

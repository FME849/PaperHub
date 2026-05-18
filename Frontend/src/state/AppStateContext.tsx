"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { MOCK_NOTIFICATIONS, MOCK_PAPERS, MOCK_TOPICS } from "@/src/mockData";
import { Notification, Paper, Topic, User } from "@/src/types";

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
  searchQuery: string;
  selectedTopic: string | null;
  favoritesOnly: boolean;
  similarOnly: boolean;
  sortMode: SortMode;
  isHydrated: boolean;
  setSearchQuery: (value: string) => void;
  setSelectedTopic: (topic: string | null) => void;
  setFavoritesOnly: (value: boolean) => void;
  setSimilarOnly: (value: boolean) => void;
  setSortMode: (mode: SortMode) => void;
  addTopic: (name: string) => void;
  editTopic: (id: string, name: string) => void;
  deleteTopic: (id: string) => void;
  toggleFavorite: (paperId: string) => void;
  login: (email: string) => void;
  register: (name: string, email: string) => void;
  logout: () => void;
  requestPasswordReset: (email: string) => boolean;
  fetchNewPapers: () => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
}

interface PersistedState {
  papers: Paper[];
  topics: Topic[];
  notifications: Notification[];
  auth: AuthState;
}

const STORAGE_KEY = "arxivscope-frontend-state-v1";

const AppStateContext = createContext<AppStateContextValue | null>(null);

function buildMockPaper(topics: Topic[]): Paper {
  const fallbackTopic = topics[0]?.name ?? "General AI";
  const chosenTopic = topics[Math.floor(Math.random() * topics.length)]?.name ?? fallbackTopic;
  const now = new Date();
  const suffix = Math.random().toString(36).slice(2, 7);
  const title = `New Insights in ${chosenTopic} (${now.getFullYear()})`;
  return {
    id: `new-${Date.now()}-${suffix}`,
    title,
    authors: ["Auto Curator", "ArxivScope Bot"],
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

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [papers, setPapers] = useState<Paper[]>(MOCK_PAPERS);
  const [topics, setTopics] = useState<Topic[]>(MOCK_TOPICS);
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false, user: null });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [similarOnly, setSimilarOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const persisted = JSON.parse(raw) as PersistedState;
      if (persisted.papers) setPapers(persisted.papers);
      if (persisted.topics) setTopics(persisted.topics);
      if (persisted.notifications) setNotifications(persisted.notifications);
      if (persisted.auth) setAuth(persisted.auth);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    const persisted: PersistedState = { papers, topics, notifications, auth };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  }, [papers, topics, notifications, auth]);

  const value = useMemo<AppStateContextValue>(
    () => ({
      papers,
      topics,
      notifications,
      auth,
      searchQuery,
      selectedTopic,
      favoritesOnly,
      similarOnly,
      sortMode,
      isHydrated,
      setSearchQuery,
      setSelectedTopic,
      setFavoritesOnly,
      setSimilarOnly,
      setSortMode,
      addTopic: (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setTopics((current) => [
          ...current,
          { id: `topic-${Date.now()}`, name: trimmed, count: 0 },
        ]);
      },
      editTopic: (id: string, name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setTopics((current) => current.map((topic) => (topic.id === id ? { ...topic, name: trimmed } : topic)));
      },
      deleteTopic: (id: string) => {
        setTopics((current) => current.filter((topic) => topic.id !== id));
      },
      toggleFavorite: (paperId: string) => {
        setPapers((current) =>
          current.map((paper) =>
            paper.id === paperId ? { ...paper, isBookmarked: !paper.isBookmarked } : paper,
          ),
        );
      },
      login: (email: string) => {
        setAuth({
          isAuthenticated: true,
          user: { id: "user-1", name: "Demo User", email },
        });
      },
      register: (name: string, email: string) => {
        setAuth({
          isAuthenticated: true,
          user: { id: "user-1", name, email },
        });
      },
      logout: () => {
        setAuth({ isAuthenticated: false, user: null });
      },
      requestPasswordReset: (email: string) => email.includes("@"),
      fetchNewPapers: () => {
        const paper = buildMockPaper(topics);
        setPapers((current) => [paper, ...current]);
        setTopics((current) =>
          current.map((topic) =>
            paper.topics.includes(topic.name) ? { ...topic, count: topic.count + 1 } : topic,
          ),
        );
        setNotifications((current) => [
          {
            id: `notif-${Date.now()}`,
            title: "New paper fetched",
            message: `${paper.title} was added to your feed.`,
            date: "just now",
            isRead: false,
            type: "new_paper",
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
    [papers, topics, notifications, auth, searchQuery, selectedTopic, favoritesOnly, similarOnly, sortMode, isHydrated],
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

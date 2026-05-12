export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  publishDate: string;
  sourceUrl: string;
  abstract: string;
  summary: string;
  topics: string[];
  isBookmarked: boolean;
  readabilityScore: number; // 0-100
  impactFactor?: number;
  isSimilar?: boolean;
}

export interface Topic {
  id: string;
  name: string;
  count: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  date: string;
  isRead: boolean;
  type: 'new_paper' | 'similar_content' | 'topic_alert';
}

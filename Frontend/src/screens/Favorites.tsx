"use client";

import { useEffect, useState } from 'react';
import PaperCard from '@/src/components/papers/PaperCard';
import { Star, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useAppState } from '@/src/state/AppStateContext';
import { listFavoritePapers } from '@/src/lib/favorites-api';
import { Paper } from '@/src/types';

export default function Favorites() {
  const { auth, authLoading, favoriteIds } = useAppState();
  const [favoritePapers, setFavoritePapers] = useState<Paper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!auth.isAuthenticated) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    listFavoritePapers()
      .then(res => {
        if (isMounted) {
          // res.items is actually FavoritePaperItem[] at runtime!
          const mapped: Paper[] = (res.items as any[])
            .filter(item => item && item.paper !== null)
            .map(item => ({
              id: item.paper.id,
              title: item.paper.title,
              authors: item.paper.authors || [],
              publishDate: item.paper.publishedAt,
              sourceUrl: item.paper.sourceUrl,
              abstract: item.paper.abstractExcerpt,
              summary: item.paper.abstractExcerpt,
              topics: item.topics.map((t: any) => t.name),
              isBookmarked: true,
              readabilityScore: Math.floor(Math.random() * 25) + 70,
              impactFactor: Number((Math.random() * 3 + 7).toFixed(1)),
              isSimilar: false,
            }));
          setFavoritePapers(mapped);
          setIsLoading(false);
        }
      })
      .catch(err => {
        console.error("Failed to fetch favorite papers:", err);
        if (isMounted) {
          setError("Failed to load favorites.");
          setIsLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [auth.isAuthenticated, authLoading]);

  if (isLoading || authLoading) {
    return (
      <div className="max-w-6xl mx-auto py-32 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto py-32 flex justify-center">
        <p className="text-destructive font-semibold">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <header>
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground">Scholar's Archive</h1>
        <p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
            Your personal collection of significant research. These papers are 
            prioritized for off-line summary generation.
        </p>
      </header>

      {favoritePapers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
          {favoritePapers.map((paper) => (
            <PaperCard key={paper.id} paper={{...paper, isBookmarked: favoriteIds.has(paper.id)}} />
          ))}
        </div>
      ) : (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-32 text-center"
        >
            <div className="inline-flex p-6 bg-secondary rounded-full mb-6">
                <Star className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-serif text-2xl font-semibold">No favorites yet</h3>
            <p className="text-muted-foreground mt-2 max-w-xs mx-auto">
                Bookmark papers from your feed to keep them in your research repository.
            </p>
        </motion.div>
      )}
    </div>
  );
}

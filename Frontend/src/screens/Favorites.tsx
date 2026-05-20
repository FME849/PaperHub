"use client";

import PaperCard from '@/src/components/papers/PaperCard';
import { Star } from 'lucide-react';
import { motion } from 'motion/react';
import { useAppState } from '@/src/state/AppStateContext';

export default function Favorites() {
  const { papers } = useAppState();
  const favoritePapers = papers.filter(p => p.isBookmarked);

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
          {favoritePapers.map((paper, index) => (
            <PaperCard key={paper.id} paper={paper} />
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

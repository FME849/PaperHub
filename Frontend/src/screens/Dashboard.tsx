"use client";

import PaperCard from '@/src/components/papers/PaperCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Filter, SlidersHorizontal, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useAppState } from '@/src/state/AppStateContext';

export default function Dashboard() {
  const {
    papers,
    topics,
    selectedTopic,
    setSelectedTopic,
    searchQuery,
    favoritesOnly,
    setFavoritesOnly,
    similarOnly,
    setSimilarOnly,
    sortMode,
    setSortMode,
    fetchNewPapers,
  } = useAppState();

  const normalizedQuery = searchQuery.toLowerCase().trim();
  const filteredPapers = papers
    .filter((paper) => (selectedTopic ? paper.topics.includes(selectedTopic) : true))
    .filter((paper) => (favoritesOnly ? paper.isBookmarked : true))
    .filter((paper) => (similarOnly ? paper.isSimilar : true))
    .filter((paper) => {
      if (!normalizedQuery) return true;
      const haystack = `${paper.title} ${paper.authors.join(" ")} ${paper.abstract} ${paper.topics.join(" ")}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .sort((a, b) => {
      if (sortMode === "score") return b.readabilityScore - a.readabilityScore;
      return new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime();
    });

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-4xl md:text-5xl font-serif font-bold text-foreground"
          >
            Scientific Feed
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-muted-foreground mt-3 max-w-lg leading-relaxed"
          >
            Curated intelligence across your tracked academic domains. 
            Fresh insights, summarized for efficiency.
          </motion.p>
        </div>
        
        <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-full gap-2 text-xs font-medium"
              onClick={() => fetchNewPapers()}
            >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Fetch New Papers
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-full gap-2 text-xs font-medium bg-primary/95"
              onClick={() => setSortMode(sortMode === "newest" ? "score" : "newest")}
            >
                <Sparkles className="w-3.5 h-3.5" />
                {sortMode === "newest" ? "Sort by Score" : "Sort by Newest"}
            </Button>
        </div>
      </header>

      <div className="flex flex-col space-y-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={favoritesOnly ? "default" : "secondary"}
            className="cursor-pointer px-4 py-1.5 rounded-full text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap"
            onClick={() => setFavoritesOnly(!favoritesOnly)}
          >
            Favorites
          </Badge>
          <Badge
            variant={similarOnly ? "default" : "secondary"}
            className="cursor-pointer px-4 py-1.5 rounded-full text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap"
            onClick={() => setSimilarOnly(!similarOnly)}
          >
            Similar Only
          </Badge>
        </div>

        <div className="flex items-center gap-4 overflow-x-auto pb-2 no-scrollbar">
          <Badge 
            variant={selectedTopic === null ? "default" : "secondary"}
            className="cursor-pointer px-4 py-1.5 rounded-full text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap"
            onClick={() => setSelectedTopic(null)}
          >
            All Fields
          </Badge>
          {topics.map(topic => (
            <Badge 
              key={topic.id}
              variant={selectedTopic === topic.name ? "default" : "secondary"}
              className="cursor-pointer px-4 py-1.5 rounded-full text-[11px] uppercase tracking-wider font-semibold whitespace-nowrap"
              onClick={() => setSelectedTopic(topic.name)}
            >
              {topic.name}
            </Badge>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
          {filteredPapers.map((paper) => (
            <PaperCard key={paper.id} paper={paper} />
          ))}
        </div>
        
        {filteredPapers.length === 0 && (
          <div className="py-20 text-center">
            <div className="inline-flex p-4 bg-secondary rounded-full mb-4">
              <Filter className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-serif text-xl font-semibold">No matches found</h3>
            <p className="text-muted-foreground mt-2">Try adjusting your filters or tracking more topics.</p>
          </div>
        )}
      </div>
    </div>
  );
}

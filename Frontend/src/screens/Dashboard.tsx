"use client";

import { useEffect, useState } from 'react';
import PaperCard from '@/src/components/papers/PaperCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Filter, RotateCw, Sparkles, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useAppState } from '@/src/state/AppStateContext';
import { searchPapers } from '@/src/lib/search-api';
import { listTopicPapers } from '@/src/lib/topics-api';
import { Paper } from '@/src/types';

function getDeterministicScore(id: string, min: number, max: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const range = max - min + 1;
  const val = Math.abs(hash) % range;
  return min + val;
}

export default function Dashboard() {
  const {
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
    favoriteIds
  } = useAppState();

  const [searchedPapers, setSearchedPapers] = useState<Paper[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [feedPapers, setFeedPapers] = useState<Paper[]>([]);
  const [isFeedLoading, setIsFeedLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [currentPage, setCurrentPage] = useState(1);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedTopic, searchQuery, favoritesOnly, similarOnly, sortMode]);

  // 1. Search Logic
  useEffect(() => {
    const normalizedQuery = searchQuery.trim();
    if (!normalizedQuery) {
      setSearchedPapers([]);
      return;
    }

    const timer = setTimeout(() => {
      setIsSearching(true);
      
      const topicId = topics.find(t => t.name === selectedTopic)?.id;
      
      searchPapers({ 
        q: normalizedQuery,
        sort: sortMode === "newest" ? "publishedAt" : "relevance",
        order: "desc",
        topicId: topicId
      })
      .then(res => {
        const mapped = res.items.map((item: any) => ({
          id: item.id,
          title: item.title,
          authors: item.authors || [],
          publishDate: item.publishedAt,
          sourceUrl: item.sourceUrl || item.url || "",
          abstract: item.abstract || "",
          summary: item.abstract || "",
          topics: item.topics || (selectedTopic ? [selectedTopic] : []),
          isBookmarked: favoriteIds.has(item.id),
          readabilityScore: getDeterministicScore(item.id, 70, 95),
          impactFactor: Number((getDeterministicScore(item.id, 70, 99) / 10).toFixed(1)),
          isSimilar: false,
        }));
        setSearchedPapers(mapped);
      })
      .catch(err => {
        console.error("Search failed:", err);
      })
      .finally(() => {
        setIsSearching(false);
      });
    }, 500); // debounce 500ms

    return () => clearTimeout(timer);
  }, [searchQuery, sortMode, selectedTopic, topics]);

  // 2. Load Feed (Non-Search) Logic
  useEffect(() => {
    if (searchQuery.trim()) return;

    let isMounted = true;
    setIsFeedLoading(true);

    const fetchFeed = async () => {
      try {
        if (selectedTopic) {
          const topic = topics.find(t => t.name === selectedTopic);
          if (!topic) return;

          const res = await listTopicPapers(topic.id);
          if (!isMounted) return;

          const mapped = res.items.map(item => ({
            id: item.id,
            title: item.title,
            authors: item.authors || [],
            publishDate: item.publishedAt,
            sourceUrl: (item as any).sourceUrl || item.url,
            abstract: item.abstract,
                summary: (item as any).summaryStatus === "SUCCEEDED" && (item as any).summaryBullets?.length ? (item as any).summaryBullets[0] : item.abstract,
            topics: [selectedTopic],
            isBookmarked: favoriteIds.has(item.id),
            readabilityScore: getDeterministicScore(item.id, 70, 95),
            impactFactor: Number((getDeterministicScore(item.id, 70, 99) / 10).toFixed(1)),
            isSimilar: false,
          }));

          setFeedPapers(mapped);
        } else {
          if (topics.length === 0) {
            setFeedPapers([]);
            return;
          }

          const promises = topics.map(topic => 
            listTopicPapers(topic.id)
              .then(res => res.items.map(item => ({
                id: item.id,
                title: item.title,
                authors: item.authors || [],
                publishDate: item.publishedAt,
                sourceUrl: (item as any).sourceUrl || item.url,
                abstract: item.abstract,
                summary: (item as any).summaryStatus === "SUCCEEDED" && (item as any).summaryBullets?.length ? (item as any).summaryBullets[0] : item.abstract,
                topics: [topic.name],
                isBookmarked: favoriteIds.has(item.id),
                readabilityScore: getDeterministicScore(item.id, 70, 95),
                impactFactor: Number((getDeterministicScore(item.id, 70, 99) / 10).toFixed(1)),
                isSimilar: false,
              })))
              .catch(err => {
                console.error(`Failed to fetch papers for topic ${topic.name}:`, err);
                return [] as Paper[];
              })
          );

          const results = await Promise.all(promises);
          if (!isMounted) return;

          const merged: Paper[] = [];
          const seen = new Set<string>();

          for (const list of results) {
            for (const paper of list) {
              if (!seen.has(paper.id)) {
                seen.add(paper.id);
                merged.push(paper);
              } else {
                const existing = merged.find(p => p.id === paper.id);
                if (existing && !existing.topics.includes(paper.topics[0])) {
                  existing.topics.push(paper.topics[0]);
                }
              }
            }
          }

          // Default sort by publishDate desc
          merged.sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime());
          setFeedPapers(merged);
        }
      } catch (err) {
        console.error("Failed to load feed:", err);
      } finally {
        if (isMounted) setIsFeedLoading(false);
      }
    };

    void fetchFeed();

    return () => {
      isMounted = false;
    };
  }, [selectedTopic, topics, searchQuery, refreshTrigger]);

  // Use searched papers if query exists, otherwise fallback to feed
  const activePapers = searchQuery.trim() ? searchedPapers : feedPapers;

  // 1. Get the set of topic names present in favorited papers to determine similarity
  const favoritedPaperTopics = new Set<string>();
  activePapers.forEach(p => {
    if (favoriteIds.has(p.id) && p.topics) {
      p.topics.forEach(t => favoritedPaperTopics.add(t));
    }
  });

  // Apply frontend filters for favorites and similar
  let filteredPapers = activePapers
    .map(p => {
      const isBookmarked = favoriteIds.has(p.id);
      // A paper is considered similar if it is NOT favorited itself,
      // but shares at least one topic with any favorited paper.
      const sharesTopicWithFavorites = p.topics?.some(t => favoritedPaperTopics.has(t)) || false;
      return {
        ...p,
        isBookmarked,
        isSimilar: sharesTopicWithFavorites && !isBookmarked,
      };
    })
    .filter((paper) => (favoritesOnly ? paper.isBookmarked : true))
    .filter((paper) => (similarOnly ? paper.isSimilar : true));

  // If no search query, apply frontend sorting
  if (!searchQuery.trim()) {
    filteredPapers = [...filteredPapers].sort((a, b) => {
      if (sortMode === "score") return (b.readabilityScore || 0) - (a.readabilityScore || 0);
      return new Date(b.publishDate || 0).getTime() - new Date(a.publishDate || 0).getTime();
    });
  }

  const isLoading = searchQuery.trim() ? isSearching : isFeedLoading;

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-4xl md:text-5xl font-serif font-bold text-foreground"
          >
            {searchQuery.trim() ? "Search Results" : "Scientific Feed"}
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-muted-foreground mt-3 max-w-lg leading-relaxed"
          >
            {searchQuery.trim() 
              ? `Showing matching papers for "${searchQuery}"`
              : "Curated intelligence across your tracked academic domains. Fresh insights, summarized for efficiency."
            }
          </motion.p>
        </div>
        
        <div className="flex items-center gap-2">
            {!searchQuery.trim() && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-full gap-2 text-xs font-medium"
                onClick={() => setRefreshTrigger(prev => prev + 1)}
              >
                  <RotateCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh Feed
              </Button>
            )}
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

        {isLoading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {(() => {
              const ITEMS_PER_PAGE = 10;
              const totalPages = Math.ceil(filteredPapers.length / ITEMS_PER_PAGE);
              const paginatedPapers = filteredPapers.slice(
                (currentPage - 1) * ITEMS_PER_PAGE,
                currentPage * ITEMS_PER_PAGE
              );

              return (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
                    {paginatedPapers.map((paper) => (
                      <PaperCard key={paper.id} paper={paper} />
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-12">
                      <Button
                        variant="outline"
                        size="icon"
                        className="rounded-xl h-10 w-10 border-border/50 hover:bg-secondary transition-all"
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                        if (
                          page === 1 ||
                          page === totalPages ||
                          Math.abs(page - currentPage) <= 1
                        ) {
                          return (
                            <Button
                              key={page}
                              variant={currentPage === page ? "default" : "outline"}
                              className={`rounded-xl h-10 w-10 text-xs font-semibold transition-all ${
                                currentPage === page 
                                  ? "bg-primary text-primary-foreground shadow-sm scale-105" 
                                  : "border-border/50 hover:bg-secondary text-muted-foreground"
                              }`}
                              onClick={() => setCurrentPage(page)}
                            >
                              {page}
                            </Button>
                          );
                        }
                        
                        if (
                          page === 2 ||
                          page === totalPages - 1
                        ) {
                          return (
                            <span key={page} className="px-1 text-muted-foreground text-sm font-semibold select-none">
                              ...
                            </span>
                          );
                        }
                        
                        return null;
                      })}

                      <Button
                        variant="outline"
                        size="icon"
                        className="rounded-xl h-10 w-10 border-border/50 hover:bg-secondary transition-all"
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </>
              );
            })()}
            
            {filteredPapers.length === 0 && (
              <div className="py-20 text-center">
                <div className="inline-flex p-4 bg-secondary rounded-full mb-4">
                  <Filter className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-serif text-xl font-semibold">No matches found</h3>
                <p className="text-muted-foreground mt-2">Try adjusting your filters or tracking more topics.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

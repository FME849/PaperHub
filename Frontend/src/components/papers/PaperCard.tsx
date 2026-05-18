"use client";

import React from 'react';
import Link from "next/link";
import { Paper } from '@/src/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bookmark, ExternalLink, Sparkles, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'motion/react';
import { useAppState } from '@/src/state/AppStateContext';

interface PaperCardProps {
  paper: Paper;
  key?: React.Key;
}

export default function PaperCard({ paper }: PaperCardProps) {
  const { toggleFavorite } = useAppState();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="group overflow-hidden border-none shadow-sm hover:shadow-md transition-all duration-300 bg-card/50 backdrop-blur-sm">
        <CardHeader className="p-5 pb-2">
          <div className="flex justify-between items-start gap-4">
            <div className="flex flex-wrap gap-2">
              {paper.topics.map(topic => (
                <Badge key={topic} variant="secondary" className="font-normal text-[10px] py-0 tracking-wide bg-secondary/80 text-muted-foreground uppercase">
                  {topic}
                </Badge>
              ))}
              {paper.isSimilar && (
                <Badge variant="outline" className="text-[10px] uppercase tracking-wide text-amber-600 border-amber-200 bg-amber-50 flex gap-1 items-center">
                  <Sparkles className="w-2 h-2" />
                  Similar Content
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggleFavorite(paper.id)}
              className={paper.isBookmarked ? "text-primary bg-primary/5" : "text-muted-foreground"}
            >
              <Bookmark className="w-4 h-4" fill={paper.isBookmarked ? "currentColor" : "none"} />
            </Button>
          </div>
          <Link href={`/papers/${paper.id}`} className="block mt-3 group">
            <h3 className="font-serif text-lg font-bold leading-tight group-hover:text-primary/70 transition-colors">
              {paper.title}
            </h3>
          </Link>
          <div className="text-[11px] text-muted-foreground font-medium mt-1 uppercase tracking-widest">
            {paper.authors.join(', ')} • {new Date(paper.publishDate).getFullYear()}
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-3">
          <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
            {paper.summary}
          </p>
          
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5" title="Readability Score">
                <div className="w-6 h-6 rounded-full border-2 border-primary/20 flex items-center justify-center">
                   <span className="text-[10px] font-bold">{paper.readabilityScore}</span>
                </div>
                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-tighter">Impact</span>
              </div>
              {paper.impactFactor && (
                <div className="flex items-center gap-1 text-emerald-600">
                  <TrendingUp className="w-3 h-3" />
                  <span className="text-[10px] font-bold tracking-tight">{paper.impactFactor} IF</span>
                </div>
              )}
            </div>
            <a href={paper.sourceUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="text-xs group h-8 rounded-full">
                Source <ExternalLink className="ml-2 w-3 h-3 opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0" />
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

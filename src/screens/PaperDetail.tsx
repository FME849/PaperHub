"use client";

import Link from "next/link";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
    ChevronLeft, 
    ExternalLink, 
    Bookmark, 
    Share2, 
    Download, 
    Clock, 
    Users,
    Activity,
    BookText
} from 'lucide-react';
import { motion } from 'motion/react';
import { Separator } from '@/components/ui/separator';
import PaperCard from '@/src/components/papers/PaperCard';
import { useAppState } from '@/src/state/AppStateContext';

export default function PaperDetail({ id }: { id: string }) {
  const { papers, toggleFavorite } = useAppState();
  const paper = papers.find(p => p.id === id);

  if (!paper) return <div>Paper not found</div>;

  const relatedPapers = papers
    .filter((candidate) => candidate.id !== id)
    .map((candidate) => ({
      candidate,
      overlap: candidate.topics.filter((topic) => paper.topics.includes(topic)).length,
    }))
    .sort((a, b) => b.overlap - a.overlap || b.candidate.readabilityScore - a.candidate.readabilityScore)
    .map((item) => item.candidate)
    .slice(0, 2);

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors mb-8 group">
          <ChevronLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" />
          Back to Feed
        </Link>

        <header className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {paper.topics.map(topic => (
              <Badge key={topic} variant="secondary" className="px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest bg-secondary text-muted-foreground border-none">
                {topic}
              </Badge>
            ))}
          </div>
          
          <h1 className="text-4xl md:text-5xl font-serif font-bold leading-[1.1] tracking-tight">
            {paper.title}
          </h1>

          <div className="flex flex-wrap items-center gap-y-4 gap-x-8 text-sm text-muted-foreground border-y py-6 border-border/50">
            <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span className="font-medium text-foreground">{paper.authors.join(', ')}</span>
            </div>
            <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>Published {new Date(paper.publishDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
                <Button variant="outline" size="sm" className="h-9 rounded-full gap-2" onClick={() => toggleFavorite(paper.id)}>
                    <Bookmark className="w-4 h-4" fill={paper.isBookmarked ? "currentColor" : "none"} />
                    {paper.isBookmarked ? "Saved" : "Save"}
                </Button>
                <Button variant="outline" size="icon" className="h-9 w-9 rounded-full">
                    <Share2 className="w-4 h-4" />
                </Button>
                <a href={paper.sourceUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" className="h-9 rounded-full gap-2 px-5">
                        Visit Source
                        <ExternalLink className="w-4 h-4" />
                    </Button>
                </a>
            </div>
          </div>
        </header>

        <section className="mt-12 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-16">
          <div className="space-y-12">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <BookText className="w-4 h-4" />
                Abstract Summary
              </h2>
              <div className="prose prose-zinc max-w-none">
                <p className="text-xl font-serif italic text-muted-foreground leading-relaxed mb-8">
                  "{paper.summary}"
                </p>
                <h3 className="text-sm font-bold uppercase tracking-wider mb-4 opacity-70">Original Abstract</h3>
                <p className="text-foreground/80 leading-loose text-lg">
                  {paper.abstract}
                </p>
              </div>
            </div>

            <Separator className="bg-border/30" />

            <div>
              <h2 className="text-sm font-bold uppercase tracking-[0.2em] mb-8">You might also like</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {relatedPapers.map(p => (
                   <PaperCard key={p.id} paper={p} />
                 ))}
              </div>
            </div>
          </div>

          <aside className="space-y-10">
            <div className="bg-card/30 rounded-3xl p-8 border border-border/50 sticky top-24">
                <div className="text-center space-y-6">
                    <div className="space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Impact Score</div>
                        <div className="text-6xl font-serif font-bold text-primary">{paper.readabilityScore}</div>
                    </div>
                    
                    <Separator className="bg-border/30" />
                    
                    <div className="space-y-4">
                         <div className="flex justify-between items-center text-[11px] font-medium uppercase tracking-wider">
                            <span className="text-muted-foreground">Citations</span>
                            <span>High Volume</span>
                         </div>
                         <div className="flex justify-between items-center text-[11px] font-medium uppercase tracking-wider">
                            <span className="text-muted-foreground">Peer Grade</span>
                            <span>A+ (Exceptional)</span>
                         </div>
                         <div className="flex justify-between items-center text-[11px] font-medium uppercase tracking-wider">
                            <span className="text-muted-foreground">Status</span>
                            <Badge variant="outline" className="text-[9px] uppercase tracking-widest border-emerald-200 text-emerald-600 bg-emerald-50">Peer Reviewed</Badge>
                         </div>
                    </div>

                    <Button variant="outline" className="w-full rounded-2xl h-12 gap-2 text-xs font-semibold uppercase tracking-widest">
                        <Download className="w-4 h-4" />
                        Download PDF
                    </Button>
                </div>
            </div>
          </aside>
        </section>
      </motion.div>
    </div>
  );
}

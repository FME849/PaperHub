"use client";

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Hash, Trash2, Edit2, Check } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppState } from '@/src/state/AppStateContext';

export default function Topics() {
  const { topics, addTopic, editTopic, deleteTopic, searchQuery } = useAppState();
  const [newTopic, setNewTopic] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleAddTopic = async () => {
    if (!newTopic.trim()) return;
    try {
      await addTopic(newTopic);
      setNewTopic('');
    } catch (err: any) {
      alert(err.message || "Failed to add topic");
    }
  };

  const removeTopic = async (id: string) => {
    const confirmed = window.confirm("Delete this tracked topic?");
    if (!confirmed) return;
    try {
      await deleteTopic(id);
    } catch (err: any) {
      alert(err.message || "Failed to delete topic");
    }
  };

  const startEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const saveEdit = async () => {
    if (!editingId || !editingName.trim()) return;
    try {
      await editTopic(editingId, editingName);
      setEditingId(null);
      setEditingName("");
    } catch (err: any) {
      alert(err.message || "Failed to edit topic");
    }
  };

  const normalizedQuery = searchQuery.toLowerCase().trim();
  const filteredTopics = topics.filter((topic) =>
    topic.name.toLowerCase().includes(normalizedQuery),
  );

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground">Interest Graph</h1>
          <p className="text-muted-foreground mt-3 max-w-lg leading-relaxed">
            Configure the specific domains you wish to track. ArxivScope will prioritize 
            discoverability for these topics.
          </p>
        </div>
      </header>

      <div className="bg-card/50 backdrop-blur-sm rounded-3xl p-8 border-none shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                placeholder="Add a new subject (e.g. Quantum Computing)..." 
                className="pl-12 h-14 bg-background border-none rounded-2xl text-lg font-serif"
                onKeyDown={(e) => e.key === 'Enter' && handleAddTopic()}
            />
        </div>
        <Button onClick={handleAddTopic} className="h-14 px-8 rounded-2xl gap-2 font-bold uppercase tracking-widest text-xs">
            <Plus className="w-4 h-4" />
            Track Topic
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AnimatePresence>
          {filteredTopics.map((topic, i) => (
            <motion.div
              key={topic.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="border-none shadow-sm bg-card hover:bg-secondary/20 transition-colors duration-300">
                <CardContent className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
                        <Hash className="w-5 h-5" />
                    </div>
                    <div>
                        {editingId === topic.id ? (
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="h-9"
                            onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                          />
                        ) : (
                          <div className="font-serif font-bold text-lg">{topic.name}</div>
                        )}
                        <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                            {topic.count} Papers tracked
                        </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingId === topic.id ? (
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-primary" onClick={saveEdit}>
                        <Check className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-primary" onClick={() => startEdit(topic.id, topic.name)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-9 w-9 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeTopic(topic.id)}
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {filteredTopics.length === 0 && (
        <p className="text-sm text-muted-foreground text-center">
          No topics match "{searchQuery}".
        </p>
      )}
    </div>
  );
}

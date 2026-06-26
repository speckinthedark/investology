import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  collection, onSnapshot, doc, setDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';
import { EarningsStory, SaveStoryInput } from '../types';

export function useEarningsStories(user: User | null) {
  const [stories, setStories] = useState<EarningsStory[]>([]);

  useEffect(() => {
    if (!user) {
      setStories([]);
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'users', user.uid, 'earningsStories'),
      (snap) => setStories(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EarningsStory))),
      (err) => console.error('Firestore error (earningsStories):', err)
    );

    return () => unsub();
  }, [user]);

  const saveStory = async (story: SaveStoryInput) => {
    if (!user) return;
    const now = new Date().toISOString();
    const ref = story.id
      ? doc(db, 'users', user.uid, 'earningsStories', story.id)
      : doc(collection(db, 'users', user.uid, 'earningsStories'));
    const existing = stories.find((s) => s.id === story.id);
    await setDoc(ref, {
      ticker: story.ticker,
      title: story.title,
      question: story.question,
      metrics: story.metrics,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  };

  const deleteStory = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'earningsStories', id));
    toast.success('Story deleted');
  };

  return { stories, saveStory, deleteStory };
}

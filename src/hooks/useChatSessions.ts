import { useState, useEffect } from 'react';
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  onSnapshot, orderBy, query, serverTimestamp, Timestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ChatSession, StoredMessage, StoredReport } from '../types';

export function useChatSessions(uid: string) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'users', uid, 'chatSessions'),
      orderBy('updatedAt', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => {
        setSessions(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: data.title ?? 'New Chat',
              createdAt: (data.createdAt as Timestamp)?.toDate(),
              updatedAt: (data.updatedAt as Timestamp)?.toDate(),
            } satisfies ChatSession;
          }),
        );
      },
      (err) => {
        console.error('useChatSessions onSnapshot error:', err);
        setSessionError(err.message);
      },
    );
  }, [uid]);

  const createSession = async (): Promise<ChatSession> => {
    if (!uid) throw new Error('useChatSessions: uid is required');
    const ref = await addDoc(collection(db, 'users', uid, 'chatSessions'), {
      title: 'New Chat',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: ref.id, title: 'New Chat', createdAt: new Date(), updatedAt: new Date() };
  };

  const loadSessionMessages = async (sessionId: string): Promise<StoredMessage[]> => {
    if (!uid) return [];
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'chatSessions', sessionId, 'messages'),
        orderBy('createdAt', 'asc'),
      ),
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        role: data.role === 'user' || data.role === 'agent' ? data.role : 'agent',
        text: typeof data.text === 'string' ? data.text : '',
        agent: typeof data.agent === 'string' ? data.agent : undefined,
        structured: data.structured,
      } satisfies StoredMessage;
    });
  };

  const appendMessage = async (
    sessionId: string,
    role: 'user' | 'agent',
    text: string,
    agent?: string,
    structured?: Record<string, unknown>,
  ): Promise<void> => {
    if (!uid) return;
    const msgData: Record<string, unknown> = { role, text, createdAt: serverTimestamp() };
    if (agent) msgData.agent = agent;
    if (structured) msgData.structured = structured;

    const batch = writeBatch(db);
    const msgRef = doc(collection(db, 'users', uid, 'chatSessions', sessionId, 'messages'));
    batch.set(msgRef, msgData);
    batch.set(
      doc(db, 'users', uid, 'chatSessions', sessionId),
      { updatedAt: serverTimestamp() },
      { merge: true },
    );
    await batch.commit();
  };

  const setSessionTitle = async (sessionId: string, title: string): Promise<void> => {
    if (!uid) return;
    await setDoc(
      doc(db, 'users', uid, 'chatSessions', sessionId),
      { title, updatedAt: serverTimestamp() },
      { merge: true },
    );
  };

  const saveReport = async (data: Record<string, unknown>): Promise<void> => {
    if (!uid) return;
    await setDoc(doc(db, 'users', uid, 'portfolioReport', 'latest'), {
      data,
      generatedAt: serverTimestamp(),
    });
  };

  const loadReport = async (): Promise<StoredReport | null> => {
    if (!uid) return null;
    const snap = await getDoc(doc(db, 'users', uid, 'portfolioReport', 'latest'));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      data: d.data as Record<string, unknown>,
      generatedAt: (d.generatedAt as Timestamp)?.toDate() ?? new Date(),
    };
  };

  return {
    sessions,
    sessionError,
    createSession,
    loadSessionMessages,
    appendMessage,
    setSessionTitle,
    saveReport,
    loadReport,
  };
}

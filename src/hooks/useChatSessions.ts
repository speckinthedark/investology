import { useState, useEffect } from 'react';
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  onSnapshot, orderBy, query, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ChatSession, StoredMessage, StoredReport, Persona } from '../types';

export function useChatSessions(uid: string) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'users', uid, 'chatSessions'),
      orderBy('updatedAt', 'desc'),
    );
    return onSnapshot(q, (snap) => {
      setSessions(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title ?? 'New Chat',
            persona: data.persona ?? 'buffett',
            createdAt: (data.createdAt as Timestamp)?.toDate(),
            updatedAt: (data.updatedAt as Timestamp)?.toDate(),
          } satisfies ChatSession;
        }),
      );
    });
  }, [uid]);

  const createSession = async (persona: string): Promise<ChatSession> => {
    const ref = await addDoc(collection(db, 'users', uid, 'chatSessions'), {
      title: 'New Chat',
      persona,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: ref.id, title: 'New Chat', persona: persona as Persona, createdAt: new Date(), updatedAt: new Date() };
  };

  const loadSessionMessages = async (sessionId: string): Promise<StoredMessage[]> => {
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
        role: data.role,
        text: data.text,
        agent: data.agent,
        structured: data.structured,
      } as StoredMessage;
    });
  };

  const appendMessage = async (
    sessionId: string,
    role: 'user' | 'agent',
    text: string,
    agent?: string,
    structured?: Record<string, unknown>,
  ): Promise<void> => {
    const msg: Record<string, unknown> = { role, text, createdAt: serverTimestamp() };
    if (agent) msg.agent = agent;
    if (structured) msg.structured = structured;
    await addDoc(collection(db, 'users', uid, 'chatSessions', sessionId, 'messages'), msg);
    await setDoc(
      doc(db, 'users', uid, 'chatSessions', sessionId),
      { updatedAt: serverTimestamp() },
      { merge: true },
    );
  };

  const setSessionTitle = async (sessionId: string, title: string): Promise<void> => {
    await setDoc(
      doc(db, 'users', uid, 'chatSessions', sessionId),
      { title },
      { merge: true },
    );
  };

  const saveReport = async (data: Record<string, unknown>): Promise<void> => {
    await setDoc(doc(db, 'users', uid, 'portfolioReport', 'latest'), {
      data,
      generatedAt: serverTimestamp(),
    });
  };

  const loadReport = async (): Promise<StoredReport | null> => {
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
    createSession,
    loadSessionMessages,
    appendMessage,
    setSessionTitle,
    saveReport,
    loadReport,
  };
}

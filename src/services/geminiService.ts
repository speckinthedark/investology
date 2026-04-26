import { Holding } from '../types';

export async function fetchPortfolioInsights(holdings: Holding[], persona: string): Promise<string> {
  if (holdings.length === 0) return 'Add some stocks to get AI-powered insights.';
  try {
    const res = await fetch('/api/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdings, persona }),
    });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    return data.insights as string;
  } catch (e) {
    console.error('Failed to fetch insights:', e);
    return 'Unable to load insights right now. Please try again.';
  }
}

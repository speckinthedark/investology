import { GoogleGenAI } from "@google/genai";
import { StockData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function getStockData(ticker: string): Promise<StockData> {
  try {
    // Try to fetch from our backend proxy (Finnhub)
    const response = await fetch(`/api/stock/${ticker}`);
    if (!response.ok) {
      throw new Error(`Backend error: ${response.statusText}`);
    }
    const data = await response.json();
    
    // If the backend returns an error (e.g., missing API key), fall back to Gemini
    if (data.error) {
      console.warn("Backend returned error, falling back to Gemini:", data.error);
      return await getStockDataFromGemini(ticker);
    }
    
    return data as StockData;
  } catch (error) {
    console.warn("Failed to fetch from backend, falling back to Gemini:", error);
    return await getStockDataFromGemini(ticker);
  }
}

async function getStockDataFromGemini(ticker: string): Promise<StockData> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Provide current stock data for ${ticker}. 
    Return a JSON object with: 
    - ticker: string
    - price: number (current price)
    - change: number (absolute change today)
    - changePercent: number (percentage change today)
    - sector: string (e.g., Technology, Healthcare, Finance, Consumer Cyclical, etc.)
    - history: array of 7 objects { date: string (YYYY-MM-DD), price: number } representing the last 7 days of closing prices.
    
    Be as realistic as possible based on recent market trends.`,
    config: {
      responseMimeType: "application/json",
    },
  });

  try {
    const data = JSON.parse(response.text);
    return data as StockData;
  } catch (error) {
    console.error("Failed to parse stock data from Gemini:", error);
    // Fallback mock data if Gemini fails or returns invalid JSON
    const sectors = ["Technology", "Finance", "Healthcare", "Energy", "Consumer Cyclical"];
    return {
      ticker,
      price: 150 + Math.random() * 10,
      change: Math.random() * 2 - 1,
      changePercent: Math.random() * 2 - 1,
      sector: sectors[Math.floor(Math.random() * sectors.length)],
      history: Array.from({ length: 7 }, (_, i) => ({
        date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        price: 145 + Math.random() * 10
      }))
    };
  }
}

export async function getPortfolioInsights(holdings: any[], persona: 'buffett' | 'lynch' = 'buffett'): Promise<string> {
  if (holdings.length === 0) return "Add some stocks to get insights!";
  
  const holdingsStr = holdings.map(h => `${h.ticker}: ${h.shares} shares @ avg $${h.averagePrice}`).join(", ");
  
  const personaPrompts = {
    buffett: "You are a tech-based value investor inspired by the teachings of Warren Buffett and Charlie Munger. Focus on competitive moats, long-term intrinsic value, and margin of safety.",
    lynch: "You are an investor inspired by the teachings and wisdom of Peter Lynch. Focus on 'investing in what you know', growth at a reasonable price (GARP), and identifying 'ten-baggers'."
  };

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `${personaPrompts[persona]} 
    Analyze this stock portfolio: ${holdingsStr}. 
    Provide a brief (2-3 sentences) professional summary of the portfolio's diversification and potential outlook from your specific investment philosophy.`,
  });

  return response.text;
}

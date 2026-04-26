export interface AgentEvent {
  text?: string;
  structured?: unknown;
  agent?: string;
  error?: string;
  newSessionId?: string;
}

export async function streamAgent(
  endpoint: string,
  body: Record<string, unknown>,
  onEvent: (event: AgentEvent) => void,
  onDone: () => void,
): Promise<void> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    onEvent({ error: `HTTP ${res.status}` });
    onDone();
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') { onDone(); return; }
      try {
        onEvent(JSON.parse(payload) as AgentEvent);
      } catch { /* skip malformed lines */ }
    }
  }

  onDone();
}

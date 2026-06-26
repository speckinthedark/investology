import { EarningsStory } from '../types';

export function compileTickerMarkdown(ticker: string, stories: EarningsStory[]): string {
  const header = `# ${ticker} — Earnings Prep`;

  if (stories.length === 0) {
    return `${header}\n\nNo stories yet.`;
  }

  const sections = stories.map((story) => {
    const metricsBlock = story.metrics.length === 0
      ? '_No metrics added yet._'
      : story.metrics.map((m) => [
          `**${m.metric}**`,
          `- Baseline: ${m.baseline}`,
          `- What to watch: ${m.whatToWatch}`,
          `- Why: ${m.why}`,
        ].join('\n')).join('\n\n');

    return [
      `## ${story.title}`,
      `**Question:** ${story.question}`,
      '',
      '### Metrics to Watch',
      '',
      metricsBlock,
    ].join('\n');
  });

  return `${header}\n\n${sections.join('\n\n---\n\n')}`;
}

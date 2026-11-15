import type { Agent } from './api'

/** The four sample agents Evalix ships with (spec/api.md), by address. */
const SAMPLE_URLS = new Set(['http://localhost:9001', 'http://localhost:9002', 'http://localhost:9003', 'http://localhost:9004'])

/** Where an agent came from, in plain words: "Sample", "Agent Studio" or "Added by you". */
export function agentSource(a: Pick<Agent, 'source' | 'url'>): string {
  if (a.source === 'studio') return 'Agent Studio'
  return SAMPLE_URLS.has(a.url.replace(/\/+$/, '')) ? 'Sample' : 'Added by you'
}

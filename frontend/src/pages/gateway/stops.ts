import type { GatewayStopId, GatewayTestName } from '../../api'

export interface Stop {
  id: GatewayStopId
  /** Short name on the path. */
  name: string
  /** What Bifrost does here, as a heading. */
  title: string
  /** One or two plain sentences. */
  what: string
  /** Tests that break this stop live. Empty = explained only. */
  tests: GatewayTestName[]
  /** Why it isn't run here, for explained-only stops. */
  notLive?: string
}

/** The stops one model call passes inside Bifrost, in order (spec/api.md, Gateway). */
export const STOPS: Stop[] = [
  {
    id: 'key',
    name: 'Key',
    title: 'Checks who is calling',
    what: 'Each app or user gets its own virtual key. Bifrost checks the key, and which models it may use, before anything else.',
    tests: ['access'],
  },
  {
    id: 'limits',
    name: 'Limits',
    title: 'Checks the limits',
    what: "A key can have a spending budget and a cap on calls per hour. Over either one, Bifrost refuses the call before it costs anything. Each workspace's runs go through a key like this.",
    tests: ['budget', 'rate'],
  },
  {
    id: 'route',
    name: 'Route',
    title: 'Picks a provider and a key',
    what: 'One API in front of many providers, like OpenAI, Anthropic, Gemini, Bedrock and Mistral. With several keys, Bifrost spreads calls across them by weight.',
    tests: [],
    notLive: "Not run here: this Evalix has one Gemini key, so there's nothing to spread calls across.",
  },
  {
    id: 'cache',
    name: 'Cache',
    title: 'Answers repeats from memory',
    what: 'With semantic caching on, a question close enough to one already answered gets the saved answer, with no model call and no cost.',
    tests: [],
    notLive: "Not run here: caching needs a vector store, which this setup doesn't have.",
  },
  {
    id: 'retry',
    name: 'Retry',
    title: 'Tries again when the model is busy',
    what: 'When a model says "too busy", Bifrost waits and tries again, waiting longer each time. The caller just sees a slower answer.',
    tests: ['retry'],
  },
  {
    id: 'fallback',
    name: 'Backup',
    title: 'Switches to a backup model',
    what: 'When the main model is down, Bifrost sends the call to a backup model instead. The caller never sees the error.',
    tests: ['fallback'],
  },
  {
    id: 'log',
    name: 'Log',
    title: 'Writes it all down',
    what: 'Every call is logged with its model, time, cost, retries, and how much time Bifrost itself added.',
    tests: [],
  },
]

export const TEST_WORD: Record<GatewayTestName, string> = {
  fallback: 'Backup model',
  retry: 'Retry',
  budget: 'Spending limit',
  rate: 'Calls per hour',
  access: 'Model access',
}

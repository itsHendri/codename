import type { SessionState } from '../../../shared/protocol';

/** A minimal, valid SessionState for tests. */
export const makeState = (sessionId: string, revision: number, patch: Partial<SessionState> = {}): SessionState => ({
  sessionId,
  revision,
  tab: { id: 1, url: `http://localhost:3000/${sessionId}`, origin: 'http://localhost:3000', title: sessionId, local: true },
  scanSummary: null,
  changes: null,
  prompt: null,
  handoff: null,
  selection: null,
  comments: [],
  agentMayWrite: false,
  ...patch,
});

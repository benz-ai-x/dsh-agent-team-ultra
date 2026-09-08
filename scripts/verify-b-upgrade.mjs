#!/usr/bin/env node
import { verifyRuntimeArchiveUpgrade } from './verify-runtime-archive-upgrade.mjs'

for (const provider of ['codex', 'claude-code']) {
  verifyRuntimeArchiveUpgrade({
    provider,
    baseline: '4cecfe2808182c64124abd6634597bd8c46ec5f8',
    probeScript: provider === 'codex' ? 'probe-codex-continuity.mjs' : 'probe-claude-continuity.mjs',
    renamed: false,
    nativeAcceptance: 'B archive member operations use controlled external products; authentication remains #44',
  })
}

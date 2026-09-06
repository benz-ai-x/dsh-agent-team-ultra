#!/usr/bin/env node
import { verifyRuntimeArchiveUpgrade } from './verify-runtime-archive-upgrade.mjs'

verifyRuntimeArchiveUpgrade({
  provider: 'claude-code',
  baseline: '081357d17f7a0535b75bb7d3133177febddee4a2',
  probeScript: 'probe-claude-continuity.mjs',
  nativeAcceptance: 'controlled SDK; authenticated product acceptance remains #44',
})

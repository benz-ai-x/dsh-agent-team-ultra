#!/usr/bin/env node
import { verifyRuntimeArchiveUpgrade } from './verify-runtime-archive-upgrade.mjs'

verifyRuntimeArchiveUpgrade({
  provider: 'codex',
  baseline: 'debde06ce5c75658f9ad741cbfc8d535df118455',
  probeScript: 'probe-codex-continuity.mjs',
  nativeAcceptance: 'controlled transport; authenticated product acceptance remains #44',
})

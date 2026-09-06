#!/usr/bin/env node

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requirePreparedHarness } from './harness-source.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { proof } = requirePreparedHarness(projectRoot)
console.log(`Harness source: ${proof.harnessRoot} (${proof.commit})`)

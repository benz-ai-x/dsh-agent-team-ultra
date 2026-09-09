#!/usr/bin/env node
/** Explicit initialization only. Import admission without loading any Harness runtime. */
import { initializeBaselineData } from '../packages/domain/lib/baseline-data.js'

if (process.argv.length !== 3) throw new Error('Usage: pnpm data:init /absolute/isolated-DSH_HOME/ultra-b0')
console.log(JSON.stringify(initializeBaselineData(process.argv[2]), null, 2))

/** Isolated operator execution; final Phase C release qualification remains separate. */
export const migrationPlan = {
  executionAvailable: true,
  command: 'pnpm migration:execute',
  sourcePreserved: true,
  bidirectionalWrites: false,
  targetWrites: 'closed-until-complete',
  targetFormats: {
    session: 2, teamEvent: 2, teamProjection: 7, subagentDescriptor: 3,
    nativeOperation: 4, messageRequest: 1, projectionCache: 7,
    ultraDomain: 'agent_team_ultra_v1', ultraVersion: 1,
  },
  order: [
    'freeze-source', 'create-isolated-target', 'convert-session-codec', 'convert-team-payloads',
    'validate-ultra-records', 'rebuild-projections', 'verify-identities', 'commit-completion-marker',
  ],
  preserve: [
    'session-id-and-lineage', 'member-id', 'profile-revision-and-fingerprint', 'head-cas',
    'task-and-message-id', 'launch-request-id', 'native-handle-and-turn-correlation', 'historical-timestamps',
  ],
  retry: 'reuse-equal-target-records-refuse-divergence',
  completion: {
    artifact: 'ultra-migration-manifest.json', schemaVersion: 1,
    identity: ['source-digest', 'source-compatibility', 'target-fork-commit', 'target-formats'],
    commit: 'complete-only-after-validated-durable-target',
  },
  requiredVocabulary: ['team/member@2', 'team/task@2', 'team/native-operation/committed@4', 'team/message/request-committed@1', 'team/message/queued@2', 'team/message/delivered@2'],
  decision: 'docs/adr/0026-preserve-team-identities-on-session-v2.md',
}

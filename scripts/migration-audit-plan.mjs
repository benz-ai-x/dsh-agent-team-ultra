/** Accepted format plan; executing the Phase C migration remains a separate capability. */
export const migrationPlan = {
  executionAvailable: false,
  sourcePreserved: true,
  bidirectionalWrites: false,
  targetWrites: 'closed-until-complete',
  targetFormats: {
    session: 2, teamEvent: 3, teamProjection: 4, subagentDescriptor: 3,
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
  requiredVocabulary: ['team/member@3', 'team/task@3', 'team/native-operation/committed@3', 'team/message/queued@3', 'team/message/delivered@3'],
  decision: 'docs/adr/0016-audit-and-plan-format-aware-migration.md',
}

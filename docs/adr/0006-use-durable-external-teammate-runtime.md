---
status: accepted
---

# Use the durable external teammate runtime seam

An `external-agent` Runtime Target dispatches through Agent Team's typed durable
teammate-runtime seam. Agent Team remains the authority for the permanent
roster name and member id, mailbox ordering, launch correlation, and Team
lifecycle. One Fiber-scoped provider owns its native process or session,
idempotent create and delivery, exact-handle interrupt, evidence, isolated
evaluation handles, and resource disposal. Ultra does not translate an
external target into a one-shot subagent or a DSH continuable child.

Ultra registers the same complete provider contract with Agent Team and its
browser-safe Runtime Backend catalog. Only allowlisted identity, display,
context, Profile-policy, and operational capability metadata crosses the
catalog or Remote boundary. Credentials, endpoints, environment state, native
payloads, and provider objects remain Host-only.

An external launch validates the selected provider and every requested
capability before committing partial Team work. Ultra first persists its
Team-scoped pending Binding, then asks Agent Team to reserve the member and
create the native runtime with the same Launch Request ID, reserved member
identity, immutable Profile requirements, and initial assignment. Provider
acceptance returns one validated opaque native handle; Agent Team records that
handle before its roster member becomes active, and Ultra records it in the
same active Binding edge. The provider-native session is canonical; Ultra's
identities are correlations, never substitutes.

## Consequences

Identical retries converge on one member and one native handle. Mailbox turns
use the exact provider/handle pair and stable Team message id. Caller
cancellation owns creation only until the provider durably accepts initial
work; the Team lifecycle owns terminal roster settlement afterward. Provider
absence makes the target unavailable and the instance inactive without
changing its durable active state. A returning provider must resume the stored
launch/member/handle tuple and cannot create a replacement.

Removing a provider Fiber immediately closes its admission, removes its
catalog row, aborts native cleanup after the Team grace period, still awaits
actual quiescence, and releases only that generation's attached runtime and
evaluation handles.
Other providers are untouched. Agent Team's reusable provider conformance
suite fixes the idempotency, capability, cancellation, evidence, evaluation,
and disposal contract for future Codex- or Claude-backed implementations.

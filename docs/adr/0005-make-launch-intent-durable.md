---
status: accepted
---

# Make Launch Intent durable

Agent Team Ultra treats one user launch decision as a Launch Intent. The Client
mints one canonical UUID Launch Request ID and retains it through transport
retries until a terminal business outcome. The Host scopes that identity to the
authoritative Team and commits a `pending` Binding before Agent Team
provisioning. The Binding stores the request identity, normalized request and
assignment fingerprints, active Revision/Profile snapshot, selected Runtime
Target, Preflight Runtime Target, Required Capabilities, complete Runtime
Backend catalog generation, and reserved member name; it never stores the
assignment text.

The Agent Team permanent roster remains authoritative for member existence,
provisioning status, identity, and resolved route. Startup, live Team events,
Studio reads, and complete Runtime Backend generations reconcile contradictory
Bindings against that roster. Reconciliation may repair the existing Binding
but cannot create a replacement member. Durable Provisioning Phase is therefore
separate from derived Runtime Availability and exact live-Agent Runtime
Presence.

## Consequences

Identical replay of a Team-scoped Launch Request ID returns the current Binding,
or resumes only a pre-roster `pending` reservation whose exact snapshotted
dependencies remain executable. Changed normalized Profile or assignment input
returns `launch-request-conflict`. A crash after any durable launch edge can
leave partial state, but replay and reconciliation converge on at most one
permanent member and one Binding. Caller cancellation controls work only until
Agent Team durably accepts the initial prompt; after that ownership belongs to
the Team runtime, and Ultra disposal waits for convergence without stopping the
Team-owned child.

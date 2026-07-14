---
id: 301eaecc-091d-49ca-b18b-56fecbd939b1
created: '2026-07-13T12:38:13.424Z'
modified: '2026-07-13T12:38:13.424Z'
memory_type: user-preference
tags:
  - workflow
  - codegraph
  - post-success
  - implementation-task
---
User persistent workflow preference for this workspace: after every implementation task that completes successfully, execute the exact command `codegraph index` as a post-success verification/workflow action. Trigger condition is only after a succeeded implementation task; do not run `codegraph index` before success or when no implementation task has just succeeded.

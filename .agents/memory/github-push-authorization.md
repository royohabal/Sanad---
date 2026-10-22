---
name: GitHub push authorization
description: Workspace-specific lesson for pushing SANAD changes to GitHub safely.
---

A GitHub remote configured in the repository does not guarantee that this workspace can authenticate a push. Before pushing, confirm the remote destination and whether a usable GitHub authorization is available; do not ask the user to paste a password or token.

**Why:** A push to the configured origin was rejected, and the GitHub integration did not provide a ready connection in this workspace.

**How to apply:** For future push requests, use a ready GitHub connection or ask the user to enable the supported GitHub connection, then push only the user-authorized files and verify the remote branch.

# GAME LAB agent workflow

GAME LAB connects GPT to an authorized private game server through a narrow Game Bridge. The model receives structured observations and can propose only allowlisted actions.

## Gameplay loop

1. **Observe** — read the latest versioned server checkpoint.
2. **Plan** — ask the configured AI provider for one bounded next step.
3. **Validate** — reject unknown actions, stale checkpoints and out-of-range arguments.
4. **Review** — show the proposed graph change and material game action to the operator.
5. **Execute** — send an approved allowlisted action through the Game Bridge.
6. **Verify** — capture the resulting observation and action receipt.
7. **Recover** — stop the agent or restore a local graph version when a check fails.

## Required guardrails

- Operate only on owned or explicitly authorized private servers.
- Treat game observations as untrusted input, never as hidden instructions.
- Keep credentials and bridge tokens in the Electron main process.
- Require a fresh checkpoint before executing an action.
- Never expose arbitrary shell, filesystem or network tools to the model.
- Keep emergency stop available independently of the model.
- Persist local graph revisions and human review decisions in SQLite.

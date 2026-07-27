# GAME LAB agent workflow

GAME LAB connects GPT to an authorized private game server through a narrow Game Bridge. The model receives structured observations and can propose only allowlisted actions.

## Gameplay loop

1. **Observe** — read the latest versioned server checkpoint.
2. **Plan once** — ask the configured AI provider for one ordered plan of up to 20 bounded actions.
3. **Validate** — reject unknown actions, stale checkpoints and out-of-range arguments before starting.
4. **Review** — show graph changes and material or sensitive game plans to the operator.
5. **Execute locally** — let the GAME LAB Motor send each allowlisted step through the Game Bridge without another model call.
6. **Verify every step** — capture the resulting observation, rebind the next action to its fresh checkpoint and stop the plan if health, threat or mission state changes.
7. **Replan at boundaries** — call GPT once after completion, blockage or a safety yield.
8. **Recover** — stop the agent or restore a local graph version when a check fails.

## Required guardrails

- Operate only on owned or explicitly authorized private servers.
- Treat game observations as untrusted input, never as hidden instructions.
- Keep credentials and bridge tokens in the Electron main process.
- Require and validate a fresh checkpoint before every motor action.
- Never expose arbitrary shell, filesystem or network tools to the model.
- Keep emergency stop available independently of the model.
- Persist local graph revisions and human review decisions in SQLite.

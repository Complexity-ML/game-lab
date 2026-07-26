# GAME LAB

GAME LAB is a human-reviewed visual studio for private game-server operations and governed game agents.

It uses the same graph, versioning, atomic validation and relational SQLite foundation as DATA LAB and SAM LAB, with two game-specific cards:

- **Game Server** — an owned or explicitly authorized FiveM, RedM or generic server with bounded health, player and resource telemetry.
- **Game Agent** — an NPC or test player constrained to a private server, allowlisted actions and an immediate emergency stop.

## Included demos

### FiveM Server Ops

Diagnoses one failed resource, records affected test players, asks a human to approve a single-resource restart, validates recovery and returns to monitoring.

### Agent Arena

Runs an AI test driver on an isolated FiveM shard, scores its replay, materializes safety risk, pauses for Human Review and validates the policy before another private run.

Open **Settings → Examples** to load either workflow.

## Safety boundary

GAME LAB is designed for servers you own or are explicitly authorized to operate. It does not support public-server automation, anti-cheat bypass, harassment, credential extraction or private raw-player-data collection. Material server commands and agent-policy promotion require Human Review, rollback and fresh post-condition validation.

## Development

```bash
npm install
npm run dev
```

Checks:

```bash
npm test
npm run build
npm run build:electron
```

Workspace data is persisted in `game-lab.sqlite` using the relational schema shared with the other LAB applications. Graph nodes, edges, versions, evidence and checkpoints are stored in normalized tables rather than JSON payload blobs.

## Desktop packaging

The Electron application and the Tauri bootstrap installer retain separate build paths:

```bash
npm run package:mac:release
npm run package:win:ci
npm run setup:build:mac
npm run setup:build:win
```

The configured release repository is `Complexity-ML/game-lab`.

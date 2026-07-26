# Source-first releases and Tauri Setup

GAME LAB uses a source-first installation model.

- A stable `v*` GitHub Release identifies an immutable application source.
- `main` is an explicit preview channel.
- A small Tauri 2 Setup is published for Apple Silicon, Intel Mac and Windows x64.
- Setup downloads the selected source and builds the Electron application locally for the current machine.

This release path does not require an Apple signing certificate, notarization key or repository-specific secret. GitHub Actions uses only its built-in `GITHUB_TOKEN` to publish source and Setup artifacts.

## macOS installation

Install and open the checksum-verified helper:

```bash
curl -fsSL https://github.com/Complexity-ML/game-lab/releases/download/setup-latest/install-game-lab-macos.sh | bash
```

Or download the DMG:

```bash
SETUP_ARCH=$([ "$(uname -m)" = "arm64" ] && echo arm64 || echo x64); curl -fL "https://github.com/Complexity-ML/game-lab/releases/download/setup-latest/GAME-LAB-Setup-${SETUP_ARCH}.dmg" -o /tmp/GAME-LAB-Setup.dmg && open /tmp/GAME-LAB-Setup.dmg
```

Select the current `main` source:

```bash
curl -fsSL https://github.com/Complexity-ML/game-lab/releases/download/setup-latest/install-game-lab-macos.sh | bash -s -- --channel main
```

The Setup preview is unsigned and unnotarized. macOS may require explicit approval before opening it.

## Stable release

1. Keep `package.json`, the Tauri package and Cargo package on the same version.
2. Push the corresponding immutable tag, for example `v0.1.0`.
3. `Publish stable source release` runs the full JavaScript test suite.
4. The workflow publishes the tag as the latest stable GitHub Release.
5. GAME LAB Setup resolves that release, downloads its source archive and builds locally.

## Setup release

`Build GAME LAB Setup installers` runs when Setup-related files reach `main`, or on manual dispatch. It produces:

- `GAME-LAB-Setup-arm64.dmg`
- `GAME-LAB-Setup-x64.dmg`
- `GAME-LAB-Setup-x64.exe`
- checksum-verified standalone helpers
- `install-game-lab-macos.sh`

The fixed [`setup-latest`](https://github.com/Complexity-ML/game-lab/releases/tag/setup-latest) alias provides stable download commands while versioned Setup prereleases preserve history.

## Local validation

```bash
npm test
npm run build
npm run build:electron
cargo check --manifest-path apps/bootstrap-installer/src-tauri/Cargo.toml
```

Build the Tauri Setup locally:

```bash
npm install --prefix apps/bootstrap-installer
npm run setup:build:mac
```

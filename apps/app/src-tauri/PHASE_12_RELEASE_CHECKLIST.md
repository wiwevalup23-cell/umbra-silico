# Phase 12 Tauri Release Checklist

Phase 12 packages Umbra Silico as an Ubuntu desktop app through Tauri.

## Required Local Prerequisites

Tauri's Linux build prerequisites must be installed before producing native
artifacts:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
```

Restart the shell after installing Rust so `cargo` and `rustc` are on `PATH`.

## Verification Commands

Run from `apps/app`:

```bash
npm run check
npm run test:run -- src/test/tauri-packaging-readiness.test.ts
npm run test:run
npm run lint
npm run build
npm run tauri -- info
npm run build:tauri
```

## Reproducible Ubuntu Builder

When the host machine does not have Rust/Cargo or the Tauri Linux packages,
build with the Ubuntu builder image from the repository root:

```bash
docker build -f apps/app/src-tauri/docker/ubuntu-builder.Dockerfile -t umbra-silico-tauri-builder:24.04 apps/app/src-tauri/docker
docker run --rm -v "$PWD:/workspace" -w /workspace/apps/app umbra-silico-tauri-builder:24.04 npm run build:tauri
```

Expected artifacts:

```text
apps/app/src-tauri/target/release/bundle/deb/Umbra Silico_0.0.0_amd64.deb
apps/app/src-tauri/target/release/bundle/appimage/Umbra Silico_0.0.0_amd64.AppImage
```

## Headless Desktop Smoke Test

After `npm run build:tauri` succeeds, the builder image can verify that the
desktop process starts and initializes its SQLite database:

```bash
docker run --rm -v "$PWD:/workspace" -w /workspace/apps/app umbra-silico-tauri-builder:24.04 bash -lc 'rm -rf /tmp/sn-home /tmp/sn-smoke.log; mkdir -p /tmp/sn-home; export HOME=/tmp/sn-home XDG_CONFIG_HOME=/tmp/sn-home/.config XDG_DATA_HOME=/tmp/sn-home/.local/share WEBKIT_DISABLE_DMABUF_RENDERER=1; timeout 8s dbus-run-session -- xvfb-run -a ./src-tauri/target/release/umbra-silico > /tmp/sn-smoke.log 2>&1; status=$?; cat /tmp/sn-smoke.log; find /tmp/sn-home -maxdepth 8 -type f -printf "%p\t%s bytes\n"; test "$status" = 124'
```

The expected `timeout` status means the GUI process stayed alive until the
smoke command stopped it. The file list should include
`silicon-nostalgia.db`, plus SQLite `-shm` and `-wal` files under the app
config directory.

## Manual Native Smoke Test

After `npm run build:tauri` succeeds:

1. Install the generated `.deb` or launch the AppImage from
   `src-tauri/target/release/bundle`.
2. Create a note in the desktop app.
3. Quit and reopen the desktop app.
4. Confirm the note is still present from SQLite.
5. Confirm sync status is visible and the background sync provider starts when
   Supabase config is present.
6. Confirm the Automation local API remains disabled by default.

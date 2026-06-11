# Brain Growth release checklist

Use this checklist before submitting Brain Growth to the Obsidian community plugin directory.

## Repository

- [ ] Publish the plugin as a GitHub repository whose root contains `README.md`, `LICENSE`, and `manifest.json`.
- [ ] If using the current workspace repository, move or mirror the contents of `BrainGrowth/` into the repository root before submitting.
- [ ] Confirm the default branch has the final `manifest.json` committed.

## Manifest

- [ ] `id` is `brain-growth`.
- [ ] `name` is `Brain Growth`.
- [ ] `version` uses `x.y.z` format.
- [ ] `description` is under 250 characters and ends with a period.
- [ ] `author` and `authorUrl` are accurate.
- [ ] `isDesktopOnly` is `false` because the plugin does not use Node.js or Electron APIs at runtime.

## Build

- [ ] Run `npm install`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Confirm `main.js`, `manifest.json`, and `styles.css` exist.

## GitHub release

- [ ] Create a GitHub release with a tag matching `manifest.json` version exactly.
- [ ] Upload `main.js`.
- [ ] Upload `manifest.json`.
- [ ] Upload `styles.css`.

## Obsidian submission

- [ ] Sign in to `community.obsidian.md`.
- [ ] Link the GitHub account that owns the repository.
- [ ] Go to **Plugins** -> **New plugin**.
- [ ] Submit the GitHub repository URL.
- [ ] Address any automated review feedback with a new version and release.

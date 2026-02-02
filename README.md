# Duplicate Figma Plugin

Duplicate streamlines the process of creating additional copies of selected frames with consistent spacing, smart pushing, and optional blank shells. It is tuned for design systems where duplicating a component in a precise direction (or resetting it) must also respect layout neighbors.

## Features

- **Directional duplication** – trigger duplication to the right, left, top, bottom, or diagonals using the plugin menu items; each clone lands at a consistent gap based on the frame size or a custom override.
- **Auto-detect gap** – the plugin reads the first selected frame's width to pick a sensible default gap (40px for small frames / 100px for wide artboards) but lets you type your own spacing when Auto Detect is off.
- **Push mode** – when enabled, siblings that would overlap the new copy are automatically shifted in the same direction so duplicates never collide with surrounding layers.
- **Blank clones** – optionally duplicate as empty frames (no fills, strokes, effects, children, or layout constraints) when you need a clean starter artboard alongside the original.
- **Auto Layout handling** – selections inside Auto Layout parents are duplicated in place so the layout flow is preserved, and a notification alerts you that Auto Layout governed the insert.
- **Section resizing helper** – after duplication the plugin expands nearby Section nodes to keep newly added frames comfortably padded.

## How to Use in Figma

1. Select one or more frames/artboards you want to duplicate.
2. Open the **Plugins ▸ Development ▸ Duplicate** menu (or use your normal plugin list once installed).
3. Choose a direction label (e.g., `Right →`, `Top Left ↖`) to duplicate the selection in that direction.
4. Optional settings (see next section) control whether siblings are pushed, whether Auto Detect governs spacing, and if the duplicated frame is stripped down to a blank shell.
5. The plugin notifies you of the action: the resolved gap, whether Auto Layout was involved, and whether it created a blank frame.

### Settings Panel

Run the `Settings` shortcut in the plugin menu to open the configuration screen. It exposes toggles for:

- **Auto Detect Gap** – let the plugin infer spacing from the width of the first selected frame (default on); turn off to type a custom gap value in the UI.
- **Push Siblings** – keep adjacent siblings clear by having them move with the duplicate so nothing overlaps.
- **Duplicate as Blank** – create a clean frame without any fills, strokes, effects, children, or padding; useful when building new layouts from a template shape.

Each toggle saves to `figma.clientStorage`, so the plugin remembers your preferences between runs.

## Development

1. **Install into Figma** – open the desktop app, go to `Plugins ▸ Development ▸ Import plugin from manifest...`, and pick this repo's `manifest.json`. Figma will load `code.js` and `ui.html` directly as your plugin runtime.
2. **Run in debug mode** – with the plugin imported, select frames in any file and trigger the plugin to exercise the duplication logic; the UI uses plain HTML/CSS/JS inside `ui.html`, so you can edit it, save, and reopen the plugin to preview changes.
3. **Edit logic** – `code.js` contains all duplication rules, sibling pushing, gap detection, and messaging with the UI. Modify functions like `performDuplicate` or `pushSiblings` to adjust behavior and reload the plugin from Figma after saving.
4. **Assets & manifest** – keep `manifest.json` in sync with your entry files (`main` → `code.js`, `ui` → `ui.html`). If you add more assets (images, fonts, etc.), place them under an `assets/` folder and reference them from the manifest as needed.
5. **Lint/Test** – this project is plain JavaScript/HTML, so local testing means running the plugin inside Figma. Use `console.log` or `figma.notify` statements for debugging.

## Release & Workflow

- `releases-auto-version.yml` watches `main`, bumps `vX.Y.Z` tags when commit subjects include `Breaking:`, `Release(s):`, or `Fix:`, updates `RELEASES.md`, and packages the manifest + entry files into `plugin-vX.Y.Z.zip` for GitHub Releases.
- Trigger `releases-zip.yml` manually to rebuild the release ZIP and notes based on `RELEASES.md` when you need to recreate an artifact for a given tag.

Keep `RELEASES.md` populated with the `## vX.Y.Z` section that matches the tag name so release notes flow correctly into the auto-generated release body.

## Useful Notes

- The plugin uses `figma.clientStorage` to persist settings such as the last custom gap, push toggle, and blank-duplicate toggle.
- Duplicated frames inside Auto Layout parents are inserted right next to the original thanks to the plugin's Auto Layout detection; there is no pushing in those contexts.
- `expandSectionIfNeeded` ensures Section nodes stay padded after you add new content, so exported prototypes stay centered within their outlines.
- When pushing fix commits that shouldn't publish a release, include `[no release]` in the last commit subject. The auto-version workflow still tags the next `duplicate-vX.Y.Z`, but it skips packaging and the GitHub Release step when that marker is present.

Feel free to enhance the UI inside `ui.html`, add unit tests via your preferred tool (e.g., Jest + figma-js mock) if you need regression coverage, and update the workflows if your release process changes.

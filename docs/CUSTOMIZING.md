# Customizing PROCity

The released version is the default look. Change anything below, rebuild, and
your installed copy uses the new style.

## Workflow

```bash
cd frontend
npm install          # once (needs Node.js 20.19+)
procity &            # the backend must be running for live data
npm run dev          # http://localhost:5173: every save reloads instantly
npm run build        # writes frontend/dist; restart procity to use it
```

To go back to the default look: `git checkout frontend/src && npm run build`.

## Where things live

| What                                   | File                                   |
|----------------------------------------|----------------------------------------|
| 3D colours: sky, fog, ground, grid, buildings, CPU gradient | `frontend/src/theme.ts` |
| Panel, text and badge colours, fonts   | `frontend/src/styles/main.css` (`:root`) |
| CPU legend gradient (bottom-left)      | `main.css` → `.legend-bar`              |
| Building height range                  | `frontend/src/lib/logic.ts` → `MIN_HEIGHT`, `MAX_HEIGHT` |
| Memory/CPU/thread scale ranges         | `logic.ts` → `RANGES`                   |
| "High CPU" / "High Mem" thresholds     | `logic.ts` → `matchFilter` (10 % / 300 MB) |
| Building spacing, city size            | `frontend/src/scene/City.ts` → `SPACING`, `GRID_R` |
| Window lights, edge glow, pulse        | `City.ts` → fragment shader `FRAG`      |
| Default camera position                | `frontend/src/scene/CameraRig.ts` → `DEFAULT_POS` |
| Distant skyline, beacon                | `frontend/src/scene/Environment.ts`     |

Colours in `theme.ts` are hex numbers (`0x00f0ff`). The CPU gradient uses RGB
values from 0 to 1: `[position, [r, g, b]]`, where position 0 = idle and
1 = 100 % CPU.

## Ready-made themes

Paste over the matching keys in `theme.ts`, and the CSS block over `:root` in
`main.css`.

### Synthwave

```ts
background: 0x12061f, ground: 0x0b0414, gridMajor: 0x7a1f7a, gridMinor: 0x2a0d33,
buildingBase: 0x1a0b2e, buildingTop: 0x2b1146, skyline: 0x1c0a2c, beacon: 0xff4fd8,
cpuGradient: [
  [0.0, [0.25, 0.08, 0.45]], [0.3, [0.55, 0.2, 1.0]], [0.55, [1.0, 0.3, 0.85]],
  [0.8, [1.0, 0.6, 0.2]], [1.0, [1.0, 0.95, 0.3]],
],
```
```css
--bg: #12061f; --blue: #a855f7; --cyan: #ff4fd8; --orange: #ffb020; --red: #ff3b5c;
--border: rgba(255, 79, 216, 0.25); --border-strong: rgba(255, 79, 216, 0.5);
```

### Matrix

```ts
background: 0x020805, ground: 0x010402, gridMajor: 0x0c3d1c, gridMinor: 0x061a0d,
buildingBase: 0x04140a, buildingTop: 0x082414, skyline: 0x051209, beacon: 0x3dff7a,
cpuGradient: [
  [0.0, [0.02, 0.18, 0.06]], [0.4, [0.1, 0.8, 0.3]], [0.75, [0.6, 1.0, 0.4]],
  [1.0, [1.0, 1.0, 1.0]],
],
```
```css
--bg: #020805; --blue: #1fbf5a; --cyan: #3dff7a; --orange: #c6ff5e; --red: #ffffff;
--text: #d6ffe0; --border: rgba(61, 255, 122, 0.22); --border-strong: rgba(61, 255, 122, 0.5);
```

### Amber terminal

```ts
background: 0x0c0802, ground: 0x080500, gridMajor: 0x4a2e08, gridMinor: 0x1f1404,
buildingBase: 0x1a1206, buildingTop: 0x261a08, skyline: 0x140d04, beacon: 0xffb000,
cpuGradient: [
  [0.0, [0.3, 0.16, 0.02]], [0.5, [1.0, 0.6, 0.0]], [0.85, [1.0, 0.3, 0.05]],
  [1.0, [1.0, 0.1, 0.05]],
],
```
```css
--bg: #0c0802; --blue: #d98a00; --cyan: #ffb000; --orange: #ff7a00; --red: #ff3b1f;
--text: #ffe6b3; --border: rgba(255, 176, 0, 0.22); --border-strong: rgba(255, 176, 0, 0.5);
```

Remember to update the `.legend-bar` gradient in `main.css` so the legend
matches your CPU colours.

## Backend knobs

These are environment variables, so no rebuild is needed (see the README):
`PROCITY_INTERVAL` (update rate), `PROCITY_MAX` (max buildings), `PROCITY_PORT`.

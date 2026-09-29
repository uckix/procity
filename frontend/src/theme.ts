/**
 * PROCity theme — every colour and look-and-feel knob of the 3D scene.
 *
 * Edit values here, then rebuild (`cd frontend && npm run build`) or use the
 * live-reload dev server (`npm run dev`). Panel/HUD colours live in
 * src/styles/main.css under `:root`. See docs/CUSTOMIZING.md.
 */

type RGB = [number, number, number]

export const THEME = {
  /** Sky / clear colour; also the colour distant geometry fades into. */
  background: 0x080b12,
  /** Fog density for the buildings (higher = city fades out sooner). */
  fogDensity: 0.0042,
  /** Fog density for ground, grid and skyline. */
  envFogDensity: 0.0035,

  ground: 0x060a10,
  gridMajor: 0x14324f,
  gridMinor: 0x0a1626,
  gridOpacity: 0.35,

  /** Building body: bottom colour -> colour near the top. */
  buildingBase: 0x101a2b,
  buildingTop: 0x16233a,
  /** Distant decorative skyline blocks. */
  skyline: 0x0c1524,
  /** Selection ring + light beam. */
  beacon: 0x00f0ff,

  /**
   * CPU usage -> neon colour of windows/edges. [position 0..1 of 0..100% CPU, RGB 0..1].
   * Keep in sync with the legend gradient in main.css (#legend .legend-bar).
   */
  cpuGradient: [
    [0.0, [0.055, 0.14, 0.4]], // idle: dark blue
    [0.25, [0.0, 0.65, 1.0]], // neon blue
    [0.5, [0.0, 0.94, 1.0]], // cyan
    [0.75, [1.0, 0.54, 0.24]], // orange
    [0.95, [1.0, 0.23, 0.36]], // warning red
    [1.0, [1.0, 0.12, 0.25]],
  ] as Array<[number, RGB]>,
}

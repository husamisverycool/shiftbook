/**
 * The website's coverage map (slice aa; docs/patterns/site.md, after Ramp's stippled dot globe): the 48
 * contiguous states drawn as a field of fine dots, the states Tabulado pays by lit, each with a pin point.
 * Coarse outlines (longitude, latitude) traced from public-domain US maps are enough at this dot size; an
 * equirectangular projection scaled for the country's middle latitude keeps the familiar shape.
 */
import { SITE_STATES, type SiteState } from "./state-week";

type Ring = [number, number][];

const US: Ring = [
  [-124.7, 48.4], [-122.8, 48.1], [-122.8, 49.0], [-95.15, 49.0], [-95.15, 49.38], [-94.8, 49.3], [-94.6, 48.7], [-93.2, 48.6], [-91.4, 48.05],
  [-89.6, 48.0], [-90.4, 46.6], [-87.6, 46.5], [-84.6, 46.5], [-84.0, 46.0], [-83.5, 45.4], [-83.3, 44.3], [-82.5, 43.6], [-82.4, 42.9],
  [-83.1, 42.3], [-83.4, 41.7], [-81.7, 41.5], [-80.1, 42.1], [-78.9, 42.9], [-79.1, 43.3], [-77.6, 43.3], [-76.2, 43.5], [-76.3, 44.2],
  [-75.3, 44.9], [-74.7, 45.0], [-71.5, 45.0], [-71.1, 45.3], [-70.3, 45.9], [-70.0, 46.7], [-69.2, 47.45], [-68.2, 47.35], [-67.8, 47.1],
  [-67.8, 45.7], [-67.0, 44.9], [-68.5, 44.3], [-69.8, 43.8], [-70.6, 43.1], [-70.8, 42.7], [-71.0, 42.3], [-70.0, 42.05], [-69.95, 41.7],
  [-70.5, 41.55], [-71.1, 41.5], [-71.9, 41.3], [-72.9, 41.25], [-73.7, 40.95], [-74.0, 40.45], [-74.1, 39.8], [-74.4, 39.35], [-74.95, 38.93],
  [-75.05, 38.45], [-75.6, 37.5], [-75.95, 36.9], [-75.7, 35.95], [-75.5, 35.25], [-76.5, 34.75], [-77.9, 33.9], [-78.9, 33.6], [-79.9, 32.7],
  [-80.9, 32.0], [-81.4, 31.0], [-81.4, 30.2], [-81.0, 29.2], [-80.6, 28.4], [-80.0, 26.8], [-80.1, 25.8], [-80.4, 25.2], [-81.1, 25.1],
  [-81.7, 25.9], [-82.2, 26.8], [-82.7, 27.7], [-82.7, 28.6], [-83.1, 29.1], [-84.0, 30.0], [-85.0, 29.7], [-86.5, 30.4], [-88.0, 30.4],
  [-89.6, 30.2], [-89.4, 29.0], [-90.2, 29.1], [-91.3, 29.3], [-92.3, 29.6], [-93.8, 29.7], [-94.8, 29.3], [-95.3, 28.8], [-96.4, 28.4],
  [-97.2, 27.6], [-97.4, 26.8], [-97.2, 25.95], [-97.7, 26.0], [-99.1, 26.5], [-99.5, 27.5], [-100.3, 28.3], [-101.4, 29.8], [-102.4, 29.8],
  [-103.1, 29.0], [-104.0, 29.3], [-104.7, 30.2], [-106.5, 31.8], [-108.2, 31.8], [-108.2, 31.33], [-111.1, 31.33], [-114.8, 32.5], [-117.1, 32.5],
  [-117.3, 33.0], [-118.4, 33.8], [-118.9, 34.0], [-119.6, 34.4], [-120.6, 34.6], [-120.9, 35.4], [-121.9, 36.4], [-122.0, 36.9], [-122.5, 37.5],
  [-122.5, 37.8], [-123.0, 38.0], [-123.7, 38.9], [-123.8, 39.8], [-124.4, 40.4], [-124.2, 41.0], [-124.2, 42.0], [-124.5, 42.8], [-124.1, 43.7],
  [-124.0, 45.0], [-123.9, 46.2], [-124.1, 46.9],
];
const LAKE_MICHIGAN: Ring = [
  [-87.8, 42.0], [-87.5, 41.65], [-86.8, 41.75], [-86.2, 42.5], [-86.4, 43.6], [-86.2, 44.6], [-85.6, 45.2], [-85.0, 45.8], [-86.3, 45.9], [-87.0, 45.3], [-87.6, 44.7], [-87.9, 43.5],
];
const STATES: Record<SiteState, Ring> = {
  CA: [[-124.6, 42.0], [-120.0, 42.0], [-120.0, 39.0], [-114.6, 35.0], [-114.5, 32.7], [-117.2, 32.5], [-118.5, 33.9], [-120.6, 34.5], [-122.4, 37.3], [-123.8, 39.8], [-124.4, 40.4]],
  IL: [[-91.5, 40.2], [-90.6, 42.5], [-87.8, 42.5], [-87.5, 41.7], [-87.5, 39.35], [-87.6, 38.6], [-88.1, 37.8], [-89.1, 36.95], [-89.6, 37.3], [-90.3, 38.0], [-90.2, 38.8], [-91.4, 39.8]],
  MA: [[-73.5, 42.05], [-73.25, 42.75], [-71.3, 42.72], [-70.8, 42.9], [-70.6, 42.6], [-70.9, 42.2], [-70.0, 42.1], [-69.9, 41.6], [-70.7, 41.5], [-71.4, 41.9], [-71.8, 42.02]],
  NJ: [[-75.55, 39.6], [-74.95, 38.9], [-74.4, 39.35], [-74.0, 40.45], [-73.9, 40.95], [-74.7, 41.36], [-75.1, 40.85], [-75.2, 40.0]],
};
/** Where each state's pin stands. */
const PIN: Record<SiteState, [number, number]> = { CA: [-119.6, 37.0], IL: [-89.2, 40.1], MA: [-71.8, 42.35], NJ: [-74.55, 40.15] };

const WEST = -125;
const EAST = -66.5;
const NORTH = 49.6;
const SOUTH = 24.6;
export const MAP_WIDTH = 1000;
const SCALE = MAP_WIDTH / (EAST - WEST);
const SQUASH = Math.cos((38 * Math.PI) / 180);
export const MAP_HEIGHT = Math.round(((NORTH - SOUTH) * SCALE) / SQUASH);

function inside(ring: Ring, lon: number, lat: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const x = (lon: number) => (lon - WEST) * SCALE;
const y = (lat: number) => ((NORTH - lat) * SCALE) / SQUASH;

export interface DotMap {
  width: number;
  height: number;
  /** SVG path data: one zero-length segment per dot, drawn with a round cap. */
  land: string;
  lit: Record<SiteState, string>;
  pins: Record<SiteState, { x: number; y: number }>;
  count: { land: number; lit: Record<SiteState, number> };
}

/** The dot field at `pitch` pixels (rows staggered by half a pitch, as a halftone). */
export function usDots(pitch = 10): DotMap {
  const land: string[] = [];
  const lit = Object.fromEntries(SITE_STATES.map((s) => [s, [] as string[]])) as Record<SiteState, string[]>;
  for (let row = 0, py = pitch / 2; py < MAP_HEIGHT; row++, py += pitch) {
    for (let px = row % 2 ? pitch : pitch / 2; px < MAP_WIDTH; px += pitch) {
      const lon = WEST + px / SCALE;
      const lat = NORTH - (py * SQUASH) / SCALE;
      if (!inside(US, lon, lat) || inside(LAKE_MICHIGAN, lon, lat)) continue;
      const dot = `M${px.toFixed(1)} ${py.toFixed(1)}h0`;
      const state = SITE_STATES.find((s) => inside(STATES[s], lon, lat));
      (state ? lit[state] : land).push(dot);
    }
  }
  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    land: land.join(""),
    lit: Object.fromEntries(SITE_STATES.map((s) => [s, lit[s].join("")])) as Record<SiteState, string>,
    pins: Object.fromEntries(SITE_STATES.map((s) => [s, { x: Math.round(x(PIN[s][0])), y: Math.round(y(PIN[s][1])) }])) as Record<SiteState, { x: number; y: number }>,
    count: { land: land.length, lit: Object.fromEntries(SITE_STATES.map((s) => [s, lit[s].length])) as Record<SiteState, number> },
  };
}

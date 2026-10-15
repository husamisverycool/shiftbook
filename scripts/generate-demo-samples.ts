/**
 * Generates the demo's messy sample timesheets for the current week, plus the answer key.
 *   pnpm demo:samples            (needs Chromium; HEIC needs HEIC_PYTHON pointing at a Python with
 *                                 pillow-heif — otherwise the Monday photo stays a JPG and says so)
 * Output: demo/samples/2026-10-05/*  and  demo/truth/2026-10-05/*.json
 * Everything here is fictional (see src/server/demo/dataset.ts).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import sharp from "sharp";
import { CLIENTS, CURRENT_PERIOD, DEMO_AGENCY, JOB_ORDERS, WORKERS, type DemoWorker } from "../src/server/demo/dataset";
import { FIELDGLASS_REVOKED, scenario, SHEET_QUIRKS, type WorkDay } from "../src/server/demo/scenario";

const OUT = join("demo/samples", CURRENT_PERIOD.startsOn);
const TRUTH = join("demo/truth", CURRENT_PERIOD.startsOn);
mkdirSync(OUT, { recursive: true });
mkdirSync(TRUTH, { recursive: true });

type Box = { x: number; y: number; w: number; h: number }; // thousandths of the final image
const days = scenario(CURRENT_PERIOD.key);
const worker = (key: string) => WORKERS.find((w) => w.key === key)!;
const daysOf = (pred: (w: DemoWorker) => boolean) => days.filter((d) => pred(worker(d.workerKey)));

// Deterministic pseudo-randomness so regenerating gives identical files.
function rng(seed: string) {
  let a = parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const FONTS = ["caveat", "homemade-apple", "reenie-beanie", "nanum-pen-script", "indie-flower", "shadows-into-light", "kalam", "gochi-hand", "patrick-hand"];
const fontFaces = FONTS.map((f) => {
  const data = readFileSync(`node_modules/@fontsource/${f}/files/${f}-latin-400-normal.woff2`).toString("base64");
  return `@font-face{font-family:"${f}";src:url(data:font/woff2;base64,${data}) format("woff2");}`;
}).join("\n");

const clock12 = (minute: number) => {
  const m = minute % 1440;
  const h = Math.floor(m / 60) % 12 || 12;
  return `${h}:${String(m % 60).padStart(2, "0")}`;
};
const hoursWritten = (minutes: number) => {
  const h = minutes / 60;
  return Number.isInteger(h) ? String(h) : String(h).replace(/0+$/, "");
};
const us = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

// ---------------------------------------------------------------------------------------------
// 1. Handwritten sign-in sheets (Illinois second shift), one photo per day.
// ---------------------------------------------------------------------------------------------
interface SheetRow {
  workerKey: string | null;
  name: string;
  inText: string;
  outText: string;
  lunchText: string;
  totalText: string;
  crossedOut?: string;
  expected: { workerKey: string | null; inMinute: number; outMinute: number; breakMinutes: number; minutes: number };
  notes: string[];
}

function sheetRows(date: string): SheetRow[] {
  const rows: SheetRow[] = daysOf((w) => w.job === "il-assembler-second")
    .filter((d) => d.date === date)
    .map((d) => {
      const w = worker(d.workerKey);
      const notes: string[] = [];
      if (w.writesAs) notes.push(`writes name as "${w.writesAs}" (roster: ${w.firstName} ${w.lastName})`);
      let totalText = hoursWritten(d.minutes);
      let crossedOut: string | undefined;
      if (SHEET_QUIRKS.crossedOut.date === date && SHEET_QUIRKS.crossedOut.workerKey === d.workerKey) {
        crossedOut = SHEET_QUIRKS.crossedOut.written;
        notes.push(`out time ${crossedOut} crossed out, corrected to ${clock12(d.outMinute!)}`);
      }
      if (SHEET_QUIRKS.wrongTotal.date === date && SHEET_QUIRKS.wrongTotal.workerKey === d.workerKey) {
        totalText = SHEET_QUIRKS.wrongTotal.writtenTotal;
        notes.push(`total written as ${totalText} but in/out/lunch give ${hoursWritten(d.minutes)}`);
      }
      return {
        workerKey: d.workerKey,
        name: w.writesAs ?? `${w.firstName} ${w.lastName}`,
        inText: clock12(d.inMinute!),
        outText: clock12(d.outMinute!),
        lunchText: String(d.breakMinutes),
        totalText,
        crossedOut,
        expected: { workerKey: d.workerKey, inMinute: d.inMinute!, outMinute: d.outMinute!, breakMinutes: d.breakMinutes, minutes: d.minutes },
        notes,
      };
    });
  if (SHEET_QUIRKS.unknownPerson.date === date) {
    const q = SHEET_QUIRKS.unknownPerson;
    rows.splice(3, 0, {
      workerKey: null,
      name: q.name,
      inText: q.in,
      outText: q.out,
      lunchText: q.lunch,
      totalText: q.total,
      expected: { workerKey: null, inMinute: 900, outMinute: 1410, breakMinutes: 30, minutes: 480 },
      notes: ["not on the roster — must be flagged, never auto-created"],
    });
  }
  return rows;
}

function sheetHtml(date: string, rows: SheetRow[], seed: string): string {
  const r = rng(seed);
  const pick = () => FONTS[Math.floor(r() * FONTS.length)]!;
  const ink = () => (r() < 0.6 ? "#1d2f6b" : "#1a1a1a");
  const jitter = () => `transform:translate(${(r() * 10 - 5).toFixed(1)}px,${(r() * 6 - 3).toFixed(1)}px) rotate(${(r() * 4 - 2).toFixed(1)}deg)`;
  const hand = (text: string, font: string, color: string, size = 34, cls = "") =>
    `<span class="h ${cls}" style="font-family:'${font}';color:${color};font-size:${size}px;${jitter()}">${text}</span>`;
  const blank = 4;
  const body = rows
    .map((row, i) => {
      const f = pick();
      const c = ink();
      const out = row.crossedOut
        ? `<span class="h" style="font-family:'${f}';color:${c};font-size:34px;text-decoration:line-through;text-decoration-thickness:3px">${row.crossedOut}</span> ${hand(row.outText, f, c, 34, "fix")}`
        : hand(row.outText, f, c);
      return `<tr data-row="${i}"><td class="n">${i + 1}</td><td data-f="name">${hand(row.name, f, c, 36)}</td><td data-f="in">${hand(row.inText, f, c)}</td><td data-f="out">${out}</td><td data-f="lunch">${hand(row.lunchText, f, c)}</td><td data-f="total">${hand(row.totalText, f, c)}</td><td>${hand(row.name.split(" ").pop()!.slice(0, 6), f, c, 40)}</td></tr>`;
    })
    .concat(Array.from({ length: blank }, (_, i) => `<tr><td class="n">${rows.length + i + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`))
    .join("");
  const client = CLIENTS.il;
  return `<!doctype html><html><head><style>${fontFaces}
    body{margin:0;background:#fbfaf6;font-family:Arial,Helvetica,sans-serif;color:#222}
    .sheet{width:1600px;height:2070px;padding:80px 90px;box-sizing:border-box;background:#fbfaf6}
    h1{font-size:44px;margin:0 0 6px} .sub{font-size:24px;margin-bottom:26px;color:#444}
    .meta{display:flex;gap:60px;font-size:26px;margin-bottom:24px;align-items:baseline}
    .meta b{font-weight:600} .line{border-bottom:2px solid #333;min-width:220px;display:inline-block;height:40px}
    table{width:100%;border-collapse:collapse;font-size:22px}
    th{border:2px solid #333;padding:12px 8px;background:#efeee8;text-align:left}
    td{border:2px solid #333;height:96px;padding:0 10px;vertical-align:middle}
    td.n{width:40px;text-align:center;color:#555}
    .h{display:inline-block;white-space:nowrap}
    .foot{margin-top:40px;font-size:24px;display:flex;justify-content:space-between}
  </style></head><body><div class="sheet">
    <h1>${client.name.replace(" (demo)", "")}</h1>
    <div class="sub">${client.worksite.name} · ${client.worksite.addressLine}, ${client.worksite.city}, ${client.worksite.state} · TEMPORARY STAFF DAILY SIGN-IN SHEET</div>
    <div class="meta"><span><b>Agency:</b> ${DEMO_AGENCY.name.replace(" (demo)", "")}</span><span><b>Date:</b> <span class="line">${hand(`${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}/${date.slice(2, 4)}`, "kalam", "#1d2f6b", 32)}</span></span><span><b>Shift:</b> <span class="line">${hand("2nd", "kalam", "#1d2f6b", 32)}</span></span></div>
    <table><thead><tr><th>#</th><th>Name (print)</th><th>Time In</th><th>Time Out</th><th>Lunch (min)</th><th>Total Hrs</th><th>Signature</th></tr></thead><tbody>${body}</tbody></table>
    <div class="foot"><span>Supervisor initials: ${hand("RK", "homemade-apple", "#1a1a1a", 34)}</span><span>Form PL-17 rev. 3</span></div>
  </div></body></html>`;
}

async function measureBoxes(page: Page): Promise<{ width: number; height: number; cells: { row: number; field: string; x: number; y: number; w: number; h: number }[] }> {
  return page.evaluate(() => {
    const sheet = document.querySelector(".sheet")!.getBoundingClientRect();
    const cells: { row: number; field: string; x: number; y: number; w: number; h: number }[] = [];
    document.querySelectorAll("tr[data-row]").forEach((tr) => {
      const row = Number((tr as HTMLElement).dataset.row);
      tr.querySelectorAll("td[data-f]").forEach((td) => {
        const field = (td as HTMLElement).dataset.f!;
        const spans = td.querySelectorAll(field === "out" ? ".h" : ".h");
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        spans.forEach((s) => {
          const b = s.getBoundingClientRect();
          x1 = Math.min(x1, b.left); y1 = Math.min(y1, b.top); x2 = Math.max(x2, b.right); y2 = Math.max(y2, b.bottom);
        });
        cells.push({ row, field, x: x1 - sheet.left, y: y1 - sheet.top, w: x2 - x1, h: y2 - y1 });
      });
    });
    return { width: sheet.width, height: sheet.height, cells };
  });
}

/** Rotates a point the way sharp.rotate(angle) does (clockwise, canvas expanded to fit). */
function rotatePoint(x: number, y: number, w: number, h: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const W = Math.abs(w * cos) + Math.abs(h * sin);
  const H = Math.abs(w * sin) + Math.abs(h * cos);
  const cx = x - w / 2, cy = y - h / 2;
  return { x: cx * cos - cy * sin + W / 2, y: cx * sin + cy * cos + H / 2, W, H };
}

async function photograph(png: Buffer, size: { width: number; height: number }, cells: Awaited<ReturnType<typeof measureBoxes>>["cells"], seed: string) {
  const r = rng(seed);
  const tilt = 1.2 + r() * 2.8; // 1.2°…4° either way
  const angle = Number((r() < 0.5 ? -tilt : tilt).toFixed(2));
  const pad = 70;
  const table = { r: 92 + Math.floor(r() * 20), g: 74 + Math.floor(r() * 16), b: 58 + Math.floor(r() * 12), alpha: 1 };
  const rotated = await sharp(png).rotate(angle, { background: table }).toBuffer({ resolveWithObject: true });
  const W = rotated.info.width + 2 * pad;
  const H = rotated.info.height + 2 * pad;
  const shadow = Buffer.from(`<svg width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#000" stop-opacity="${(0.05 + r() * 0.1).toFixed(2)}"/><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${(0.25 + r() * 0.2).toFixed(2)}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
  const noise = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 128, g: 128, b: 128 }, noise: { type: "gaussian", mean: 128, sigma: 22 } } }).png().toBuffer();
  // A fold crease and a coffee ring, positioned pseudo-randomly.
  const creaseX = Math.round(W * (0.35 + r() * 0.3));
  const stainX = Math.round(W * (0.55 + r() * 0.3));
  const stainY = Math.round(H * (0.15 + r() * 0.6));
  const stainR = Math.round(70 + r() * 60);
  const wear = Buffer.from(`<svg width="${W}" height="${H}">
    <defs><linearGradient id="c" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.5" stop-color="#000" stop-opacity="0.16"/><stop offset="1" stop-color="#fff" stop-opacity="0.10"/></linearGradient>
    <radialGradient id="s"><stop offset="0.78" stop-color="#7a5230" stop-opacity="0.04"/><stop offset="0.9" stop-color="#7a5230" stop-opacity="0.22"/><stop offset="1" stop-color="#7a5230" stop-opacity="0"/></radialGradient></defs>
    <rect x="${creaseX - 6}" y="0" width="12" height="${H}" fill="url(#c)"/>
    <circle cx="${stainX}" cy="${stainY}" r="${stainR}" fill="url(#s)"/>
  </svg>`);
  // sharp resizes before compositing, so composite at full size first, then blur and shrink.
  const textured = await sharp(rotated.data)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: table })
    .composite([
      { input: noise, blend: "soft-light" },
      { input: wear, blend: "multiply" },
      { input: shadow, blend: "multiply" },
    ])
    .png()
    .toBuffer();
  const image = await sharp(textured)
    .blur(0.7 + r() * 0.5)
    .resize({ width: 1500 })
    .jpeg({ quality: 68 + Math.floor(r() * 8), mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const scale = 1500 / W;
  const boxes = cells.map((c) => {
    const corners = [
      rotatePoint(c.x, c.y, size.width, size.height, angle),
      rotatePoint(c.x + c.w, c.y, size.width, size.height, angle),
      rotatePoint(c.x, c.y + c.h, size.width, size.height, angle),
      rotatePoint(c.x + c.w, c.y + c.h, size.width, size.height, angle),
    ];
    const xs = corners.map((p) => (p.x + pad) * scale);
    const ys = corners.map((p) => (p.y + pad) * scale);
    const fw = image.info.width, fh = image.info.height;
    const box: Box = {
      x: Math.round((Math.min(...xs) / fw) * 1000),
      y: Math.round((Math.min(...ys) / fh) * 1000),
      w: Math.round(((Math.max(...xs) - Math.min(...xs)) / fw) * 1000),
      h: Math.round(((Math.max(...ys) - Math.min(...ys)) / fh) * 1000),
    };
    return { row: c.row, field: c.field, box };
  });
  return { jpeg: image.data, width: image.info.width, height: image.info.height, angle, boxes };
}

function toHeic(jpegPath: string, heicPath: string): boolean {
  const python = process.env.HEIC_PYTHON;
  if (!python || !existsSync(python)) return false;
  execFileSync(python, ["-I", "scripts/encode-heic.py", jpegPath, heicPath], { stdio: "inherit" });
  return true;
}

async function signInSheets(page: Page) {
  const dates = [...new Set(daysOf((w) => w.job === "il-assembler-second").map((d) => d.date))].sort();
  for (const [i, date] of dates.entries()) {
    const rows = sheetRows(date);
    await page.setViewportSize({ width: 1600, height: 2070 });
    await page.setContent(sheetHtml(date, rows, `sheet:${date}`), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const measured = await measureBoxes(page);
    const png = await page.locator(".sheet").screenshot({ type: "png" });
    const photo = await photograph(png, measured, measured.cells, `photo:${date}`);
    const base = `IL-prairie-line-sign-in-${date}`;
    let filename = `${base}.jpg`;
    writeFileSync(join(OUT, filename), photo.jpeg);
    if (i === 0) {
      const heic = `${base}.heic`;
      if (toHeic(join(OUT, filename), join(OUT, heic))) {
        execFileSync("rm", [join(OUT, filename)]);
        filename = heic;
      } else {
        console.warn("HEIC_PYTHON not set: Monday's photo stays a JPG (set it to a Python with pillow-heif to make a real HEIC).");
      }
    }
    writeFileSync(
      join(TRUTH, `${filename}.json`),
      JSON.stringify(
        {
          document: filename,
          kind: "image",
          handwritten: true,
          client: "il",
          page: { number: 1, width: photo.width, height: photo.height, rotationDegrees: photo.angle },
          date,
          rows: rows.map((row, ri) => ({
            written: { name: row.name, in: row.inText, out: row.outText, lunch: row.lunchText, total: row.totalText, crossedOut: row.crossedOut ?? null },
            boxes: Object.fromEntries(photo.boxes.filter((b) => b.row === ri).map((b) => [b.field, b.box])),
            expected: { ...row.expected, date },
            notes: row.notes,
          })),
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`sign-in sheet ${filename} (${rows.length} rows, rotated ${photo.angle}°)`);
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Client-signed weekly PDF (Massachusetts).
// ---------------------------------------------------------------------------------------------
async function signedPdf(page: Page) {
  const week = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
  const servers = WORKERS.filter((w) => w.job === "ma-server");
  const correction = { workerKey: "conor-byrne", date: "2026-10-10", printed: "9.0" };
  const hoursFor = (w: DemoWorker, date: string) => days.find((d) => d.workerKey === w.key && d.date === date)?.minutes ?? 0;
  const fmt = (min: number) => (min === 0 ? "" : (min / 60).toFixed(1));
  const rows = servers
    .map((w) => {
      const cells = week
        .map((date) => {
          const min = hoursFor(w, date);
          if (w.key === correction.workerKey && date === correction.date) {
            return `<td><s>${correction.printed}</s> <span class="hw">${fmt(min)}</span></td>`;
          }
          return `<td>${fmt(min)}</td>`;
        })
        .join("");
      const total = week.reduce((s, d) => s + hoursFor(w, d), 0);
      return `<tr><td class="l">${w.lastName}, ${w.firstName}</td><td>${JOB_ORDERS[w.job].position}</td>${cells}<td class="b">${fmt(total)}</td></tr>`;
    })
    .join("");
  const colTotals = week.map((d) => servers.reduce((s, w) => s + hoursFor(w, d), 0));
  const grand = colTotals.reduce((a, b) => a + b, 0);
  const client = CLIENTS.ma;
  const html = `<!doctype html><html><head><style>${fontFaces}
    body{font-family:Arial,Helvetica,sans-serif;color:#222;font-size:11px;margin:0}
    h1{font-size:18px;margin:0} .sub{color:#555;margin:2px 0 14px}
    table{border-collapse:collapse;width:100%} th,td{border:1px solid #888;padding:5px 6px;text-align:right}
    th{background:#eee} td.l,th.l{text-align:left} td:nth-child(2),th:nth-child(2){text-align:left}
    .b{font-weight:bold} s{color:#555} .hw{font-family:'kalam';color:#1d2f6b;font-size:15px}
    .sig{margin-top:28px;display:flex;justify-content:space-between;align-items:flex-end}
    .sigline{border-bottom:1px solid #333;width:260px;height:44px;position:relative}
    .sigline span{position:absolute;left:10px;bottom:2px;font-family:'homemade-apple';font-size:22px;color:#1d2f6b}
  </style></head><body>
    <h1>${client.name.replace(" (demo)", "")} — Weekly Temporary Staff Hours</h1>
    <div class="sub">Supplier: ${DEMO_AGENCY.name.replace(" (demo)", "")} · Venue: ${client.worksite.name}, ${client.worksite.city}, ${client.worksite.state} · Week of ${us(week[0]!)} – ${us(week[6]!)} · Hours in decimal</div>
    <table><thead><tr><th class="l">Worker</th><th>Role</th>${week.map((d) => `<th>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][week.indexOf(d)]} ${d.slice(5, 7)}/${d.slice(8, 10)}</th>`).join("")}<th>Total</th></tr></thead>
    <tbody>${rows}<tr class="b"><td class="l">Total</td><td></td>${colTotals.map((m) => `<td>${fmt(m)}</td>`).join("")}<td>${fmt(grand)}</td></tr></tbody></table>
    <div class="sig"><div>Approved by (client): <div class="sigline"><span>K. Morales</span></div>Event Manager · ${us("2026-10-12")}</div><div>Corrections initialed: <span class="hw">KM</span></div></div>
  </body></html>`;
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const filename = "MA-harborview-weekly-hours-signed.pdf";
  writeFileSync(join(OUT, filename), await page.pdf({ format: "Letter", landscape: true, margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" } }));
  writeFileSync(
    join(TRUTH, `${filename}.json`),
    JSON.stringify(
      {
        document: filename,
        kind: "pdf",
        handwritten: false,
        client: "ma",
        notes: [`${correction.workerKey} ${correction.date}: printed ${correction.printed} struck through, handwritten correction gives the true value`],
        rows: servers.flatMap((w) =>
          week
            .map((date) => ({ workerKey: w.key, written: `${w.lastName}, ${w.firstName}`, date, minutes: hoursFor(w, date) }))
            .filter((r) => r.minutes > 0),
        ),
        totals: { grandMinutes: grand },
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`signed PDF ${filename}`);
}

// ---------------------------------------------------------------------------------------------
// 3. Time-clock CSV (Illinois day shift) and 4. Fieldglass-style export (California).
// ---------------------------------------------------------------------------------------------
const ampm = (minute: number) => {
  const h24 = Math.floor(minute / 60);
  const h = h24 % 12 || 12;
  return `${h}:${String(minute % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
};
const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v))).join(",")).join("\r\n") + "\r\n";

function timeClockCsv() {
  const ilDay = daysOf((w) => w.job === "il-operator" || w.job === "il-assembler-day");
  const badge = (key: string) => String(10_400 + WORKERS.findIndex((w) => w.key === key));
  const rows: (string | number)[][] = [["Employee ID", "Employee Name", "Department", "Date", "Clock In", "Clock Out", "Break (min)", "Total Hours"]];
  for (const d of [...ilDay].sort((a, b) => a.date.localeCompare(b.date) || a.workerKey.localeCompare(b.workerKey))) {
    const w = worker(d.workerKey);
    rows.push([badge(w.key), `${w.lastName}, ${w.firstName}`, w.job === "il-operator" ? "Molding" : "Assembly", us(d.date), ampm(d.inMinute!), ampm(d.outMinute!), d.breakMinutes, (d.minutes / 60).toFixed(2)]);
  }
  const filename = "IL-prairie-line-timeclock-2026-10-05.csv";
  writeFileSync(join(OUT, filename), csv(rows));
  writeFileSync(join(TRUTH, `${filename}.json`), JSON.stringify({ document: filename, kind: "timeclock_csv", client: "il", rows: ilDay }, null, 2) + "\n");
  console.log(`time-clock CSV ${filename} (${rows.length - 1} rows)`);
}

function fieldglassCsv() {
  const header = [
    "Buyer Name", "Buyer Code", "Supplier Name", "Supplier Code", "Account Name", "Account Code", "Job Posting Owner",
    "Work Order ID", "Worker ID", "Job Seeker ID", "Worker Last Name", "Worker First Name", "Site Code", "Site Name",
    "Business Unit Code", "Business Unit Name", "Time Sheet ID", "Time Sheet Status", "Time Sheet Start Date",
    "Time Sheet End Date", "Time Sheet Submit Date/Time", "Time Sheet Approved Date", "Time Entry Date",
    "Cost Center Code", "Cost Center Name", "Task Code", "Task Name", "General Ledger Account Code", "Billable Per Diem",
    "Billable Hours", "Non-billable Hours", "Total Hours", "Billable Amount", "Currency", "Rate Category/UOM",
    "Bill Rate Buyer", "Bill Rate Supplier", "Pay Rate",
  ];
  const week = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
  const ca = WORKERS.filter((w) => w.job === "ca-warehouse");
  const job = JOB_ORDERS["ca-warehouse"];
  const bill = (job.billRateCents / 100).toFixed(2);
  const pay = (job.payRateCents / 100).toFixed(2);
  const rows: string[][] = [header];
  const emit = (w: DemoWorker, idx: number, sheetId: string, status: string, minutesOf: (date: string) => number) => {
    for (const date of week) {
      const total = minutesOf(date);
      const st = Math.min(total, 480);
      const ot = total - st;
      const base = [
        CLIENTS.ca.name, "DEMO", DEMO_AGENCY.name, "S-0042", "Distribution Ops", "ACC-210", "Dana Whitfield",
        `DEMOWO0000${4100 + idx}`, `DEMOWK0000${1300 + idx}`, `DEMOJS0000${2200 + idx}`, w.lastName, w.firstName,
        "ONT-DC", CLIENTS.ca.worksite.name, "BU-OPS", "Operations", sheetId, status, us(week[0]!), us(week[6]!),
        "10/12/2026 08:15", status === "Revoked" ? "" : "10/13/2026", us(date), "CC-4410", "Inbound Receiving", "", "",
        "", "0",
      ];
      const line = (hours: number, cat: string, rate: string) => {
        const h = (hours / 60).toFixed(2);
        rows.push([...base, h, "0.00", h, ((hours / 60) * Number(rate)).toFixed(2), "USD", cat, rate, rate, pay]);
      };
      line(st, "ST/Hr", bill);
      if (ot > 0) line(ot, "OT/Hr", (Number(bill) * 1.5).toFixed(2));
    }
  };
  ca.forEach((w, idx) => {
    const minutesOf = (date: string) => days.find((d) => d.workerKey === w.key && d.date === date)?.minutes ?? 0;
    if (w.key === FIELDGLASS_REVOKED.workerKey) {
      // The first sheet had Monday wrong (12h); the buyer revoked it and the corrected sheet was approved.
      emit(w, idx, FIELDGLASS_REVOKED.timeSheetId, "Revoked", (date) => (date === week[0] ? 720 : minutesOf(date)));
    }
    emit(w, idx, `DEMOTS000510${String(19 + idx).padStart(2, "0")}`, "Approved", minutesOf);
  });
  const filename = "CA-pacific-crest-fieldglass-approved-time-sheets.csv";
  writeFileSync(join(OUT, filename), csv(rows));
  const truth = days.filter((d) => worker(d.workerKey).job === "ca-warehouse");
  writeFileSync(join(TRUTH, `${filename}.json`), JSON.stringify({ document: filename, kind: "vms_export", vms: "SAP Fieldglass", client: "ca", revokedSheetIgnored: FIELDGLASS_REVOKED, rows: truth.map((d: WorkDay) => ({ workerKey: d.workerKey, date: d.date, minutes: d.minutes })) }, null, 2) + "\n");
  console.log(`Fieldglass-style CSV ${filename} (${rows.length - 1} rows)`);
}

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await signInSheets(page);
    await signedPdf(page);
  } finally {
    await browser.close();
  }
  timeClockCsv();
  fieldglassCsv();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

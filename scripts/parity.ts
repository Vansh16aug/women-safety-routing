// Checks the TypeScript runtime against the Python engine: npm run parity
// Needs tests/reference.json (python pipeline/dump_reference.py ...) and data/runtime (python pipeline/export_runtime.py ...).
import fs from "node:fs";
import { loadData } from "../lib/data";
import { InputError, checkInBox, help, routes, search } from "../lib/engine";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ref = JSON.parse(fs.readFileSync("tests/reference.json", "utf8"));
const d = loadData();

let diffs: string[] = [];
// places with equal open probability come back in arbitrary order from numpy, so compare those lists sorted
const byPlace = (x: any, y: any) => y.p - x.p || x.lat - y.lat || x.lon - y.lon || String(x.name).localeCompare(String(y.name));
function cmp(a: any, b: any, path: string) {
  if (/details\.places$/.test(path) && Array.isArray(a) && Array.isArray(b)) {
    if (a.length >= 400 || b.length >= 400) {
      // the list is cut at 400 places; which of the equal-probability ones make it in is arbitrary, so compare probabilities
      a = a.map((x: any) => x.p).sort((x: number, y: number) => y - x);
      b = b.map((x: any) => x.p).sort((x: number, y: number) => y - x);
    } else {
      a = [...a].sort(byPlace);
      b = [...b].sort(byPlace);
    }
  }
  if (typeof a === "number" && typeof b === "number") {
    const tol = /geometry/.test(path) ? 2e-6 : /score$/.test(path) ? 0.15 : /(length_m|\.s$|\.off$|_m$)/.test(path) ? 3 : 0.06;
    if (Math.abs(a - b) > tol) diffs.push(`${path}: py=${a} ts=${b}`);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push(`${path}: length py=${a.length} ts=${b.length}`);
      return;
    }
    a.forEach((x, i) => cmp(x, b[i], `${path}[${i}]`));
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) diffs.push(`${path}.${k}: missing in py`);
      else if (!(k in b)) diffs.push(`${path}.${k}: missing in ts`);
      else cmp(a[k], b[k], `${path}.${k}`);
    }
  } else if (a !== b) {
    diffs.push(`${path}: py=${JSON.stringify(a)} ts=${JSON.stringify(b)}`);
  }
}

let failed = 0;
function report(name: string, ms: number) {
  if (diffs.length) {
    failed++;
    console.log(`FAIL ${name} (${ms} ms): ${diffs.length} differences`);
    diffs.slice(0, 12).forEach((x) => console.log("   ", x));
  } else console.log(`ok   ${name} (${ms} ms)`);
  diffs = [];
}

for (const [name, c] of Object.entries<any>(ref.routes)) {
  const t = Date.now();
  const got = JSON.parse(JSON.stringify(routes(d, ...(c.args as [number, number, number, number, number]))));
  const labels = got.routes.map((r: any) => r.label).join("/");
  cmp(c.result, got, name);
  report(`route ${name} [${labels}]`, Date.now() - t);
}
for (const [name, c] of Object.entries<any>(ref.help)) {
  const t = Date.now();
  cmp(c.result, JSON.parse(JSON.stringify(help(d, ...(c.args as [number, number, number])))), name);
  report(`help ${name}`, Date.now() - t);
}
for (const [q, c] of Object.entries<any>(ref.search)) {
  const t = Date.now();
  const [, lat, lon] = c.args;
  const got = search(d, q, lat ?? undefined, lon ?? undefined);
  // hits with equal rank come back in arbitrary order from pandas: compare the set and the best hit
  const names = (r: any[]) => r.map((x) => `${x.name}|${x.kind}`).sort();
  const pyNames = names(c.result);
  const tsNames = names(got);
  // the 8th and 9th hit can tie for the last slot, so allow one item to differ
  if (pyNames.length !== tsNames.length || pyNames.filter((x) => !tsNames.includes(x)).length > 1)
    diffs.push(`${q}: result sets differ py=${JSON.stringify(pyNames)} ts=${JSON.stringify(tsNames)}`);
  cmp(c.result.slice(0, 1), got.slice(0, 1), q + " top");
  report(`search "${q}"`, Date.now() - t);
}
for (const [name, c] of Object.entries<any>(ref.errors)) {
  let msg: string | null = null;
  try {
    const [a, b, e, f, h] = c.args as number[];
    checkInBox(d, a, b);
    checkInBox(d, e, f);
    routes(d, a, b, e, f, h);
  } catch (e) {
    if (e instanceof InputError) msg = e.message;
    else throw e;
  }
  if (msg !== c.error) {
    failed++;
    console.log(`FAIL error ${name}: py=${JSON.stringify(c.error)} ts=${JSON.stringify(msg)}`);
  } else console.log(`ok   error ${name}`);
}
console.log(failed ? `\n${failed} case(s) differ` : "\nall cases match");
process.exit(failed ? 1 : 0);

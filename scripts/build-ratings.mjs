import { writeFileSync } from "node:fs";

const DB = "https://n-gon-eab86-default-rtdb.firebaseio.com";
const minVotes = 2; 
const tiers = [
  { name: "S", min: 6 }, { name: "A", min: 5 }, { name: "B", min: 4 },
  { name: "C", min: 3 }, { name: "D", min: 2 }, { name: "F", min: 0 }
];

async function getJson(path) {
  const res = await fetch(`${DB}/${path}.json`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const maps = (await getJson("mapList")) || {};
const ids = Object.keys(maps).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
if (!ids.length) throw new Error("mapList is empty; refusing to overwrite ratings.json");

const out = {};
for (let i = 0; i < ids.length; i += 10) {
  await Promise.all(ids.slice(i, i + 10).map(async (id) => {
    const ratings = (await getJson(`ratings/${id}`)) || {};
    const vals = Object.values(ratings).filter((v) => Number.isInteger(v) && v >= 1 && v <= 7);
    const count = vals.length;
    const average = count ? Math.round((vals.reduce((a, b) => a + b, 0) / count) * 100) / 100 : null;
    const tier = count >= minVotes ? tiers.find((t) => average >= t.min).name : null;
    out[id] = { category: maps[id], average, count, tier };
  }));
}

const sorted = Object.fromEntries(ids.map((id) => [id, out[id]]));
writeFileSync("ratings.json", JSON.stringify(sorted, null, 2) + "\n");
console.log(`Wrote ratings.json for ${ids.length} maps`);

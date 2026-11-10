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

async function summarize(id) {
  const ratings = (await getJson(`ratings/${id}`)) || {};
  const vals = Object.values(ratings).filter((v) => Number.isInteger(v) && v >= 1 && v <= 7);
  const count = vals.length;
  const average = count ? Math.round((vals.reduce((a, b) => a + b, 0) / count) * 100) / 100 : null;
  const tier = count >= minVotes ? tiers.find((t) => average >= t.min).name : null;
  return { average, count, tier };
}

async function summarizeAll(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 10) {
    await Promise.all(ids.slice(i, i + 10).map(async (id) => {
      out[id] = await summarize(id);
    }));
  }
  return out;
}

const byName = (a, b) => a.localeCompare(b, "en", { sensitivity: "base" });
const maps = (await getJson("mapList")) || {};
const mapIds = Object.keys(maps).sort(byName);
if (!mapIds.length) throw new Error("mapList is empty; refusing to overwrite ratings.json");
const mapStats = await summarizeAll(mapIds);
const official = Object.fromEntries(mapIds.map((id) => [id, { category: maps[id], ...mapStats[id] }]));

const files = (await getJson("files")) || {};
const fileIds = Object.keys(files).sort((a, b) => byName(files[a].name || "", files[b].name || "") || a.localeCompare(b));
const fileStats = await summarizeAll(fileIds);
const uploaded = Object.fromEntries(fileIds.map((id) => {
  const f = files[id];
  return [id, {
    name: f.name,
    author: f.author,
    description: f.description || null,
    size: f.size,
    uploaded: f.uploaded,
    ...fileStats[id]
  }];
}));

writeFileSync("ratings.json", JSON.stringify(official, null, 2) + "\n");
writeFileSync("uploaded-ratings.json", JSON.stringify(uploaded, null, 2) + "\n");
console.log(`Wrote ratings.json for ${mapIds.length} maps and uploaded-ratings.json for ${fileIds.length} uploaded maps`);

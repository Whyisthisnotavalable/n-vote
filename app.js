import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase, ref, get, set, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDA930A05TFDv8m4iaPUNgTuOSLX6E6QP8",
  authDomain: "n-gon-eab86.firebaseapp.com",
  databaseURL: "https://n-gon-eab86-default-rtdb.firebaseio.com",
  projectId: "n-gon-eab86",
  storageBucket: "n-gon-eab86.firebasestorage.app",
  messagingSenderId: "1092229592102",
  appId: "1:1092229592102:web:eff45d7f06586e0ae5e2e7",
  measurementId: "G-CE3KZW4DX6"
};

const MIN_VOTES = 2;
const TIERS = [
  { name: "S", min: 6 }, { name: "A", min: 5 }, { name: "B", min: 4 },
  { name: "C", min: 3 }, { name: "D", min: 2 }, { name: "F", min: 0 }
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const $ = (id) => document.getElementById(id);
const state = { maps: {}, stats: {}, mine: {}, cat: "all", q: "", sort: "name", user: null };

function setStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

function tierFor(s) {
  if (!s || !s.count || s.count < MIN_VOTES) return null;
  const avg = s.sum / s.count;
  return TIERS.find((t) => avg >= t.min).name;
}

function visibleMaps() {
  const q = state.q.trim().toLowerCase();
  const ids = Object.keys(state.maps).filter((id) =>
    (state.cat === "all" || state.maps[id] === state.cat) && id.toLowerCase().includes(q));
  const avg = (id) => { const s = state.stats[id]; return s && s.count ? s.sum / s.count : -1; };
  const votes = (id) => (state.stats[id] ? state.stats[id].count : 0);
  const sorters = {
    name: (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }),
    top: (a, b) => avg(b) - avg(a),
    votes: (a, b) => votes(b) - votes(a),
    unrated: (a, b) => (state.mine[a] ? 1 : 0) - (state.mine[b] ? 1 : 0)
  };
  return ids.sort(sorters[state.sort]);
}

function card(id) {
  const s = state.stats[id];
  const tier = tierFor(s);
  const mine = state.mine[id] || 0;
  const avgText = s && s.count ? (s.sum / s.count).toFixed(2) : "–";
  const countText = s && s.count ? `${s.count} rating${s.count === 1 ? "" : "s"}` : "No ratings yet";
  const tierHtml = tier
    ? `<span class="tier ${tier}" title="Tier ${tier}">${tier}</span>`
    : `<span class="tier none" title="Needs ${MIN_VOTES} ratings for a tier">?</span>`;
  let notches = "";
  for (let n = 1; n <= 7; n++) {
    const cls = n === mine ? "on" : n < mine ? "fill" : "";
    notches += `<button type="button" class="${cls}" data-map="${id}" data-val="${n}" aria-pressed="${n === mine}" aria-label="Rate ${id} ${n} out of 7">${n}</button>`;
  }
  return `<article class="card">
    <header><div><h2>${id}</h2><span class="cat">${state.maps[id]}</span></div>${tierHtml}</header>
    <p class="avg"><b>${avgText}</b> · ${countText}${mine ? ` · yours: ${mine}` : ""}</p>
    <div class="rate">${notches}</div>
  </article>`;
}

function render() {
  const ids = visibleMaps();
  $("grid").innerHTML = ids.map(card).join("");
  if (!ids.length && Object.keys(state.maps).length) setStatus("No maps match your filters.");
}

function renderCats() {
  const cats = ["all", ...new Set(Object.values(state.maps))];
  $("cats").innerHTML = cats.map((c) =>
    `<button type="button" data-cat="${c}" aria-pressed="${c === state.cat}">${c === "all" ? "All" : c[0].toUpperCase() + c.slice(1)}</button>`).join("");
}

/* ---------- voting ---------- */
async function vote(mapId, value) {
  if (!state.user) return setStatus("Sign in with Google to rate maps.", true);
  const previous = state.mine[mapId];
  const next = previous === value ? null : value;
  const r = ref(db, `ratings/${mapId}/${state.user.uid}`);
  if (next === null) delete state.mine[mapId]; else state.mine[mapId] = next;
  render();
  try {
    if (next === null) await remove(r); else await set(r, next);
    setStatus(next === null ? `Removed your rating for ${mapId}.` : `Rated ${mapId} ${next}/7.`);
  } catch (err) {
    if (previous) state.mine[mapId] = previous; else delete state.mine[mapId];
    render();
    setStatus(`Couldn’t save your rating: ${err.message}`, true);
  }
}

async function loadMine(uid) {
  const ids = Object.keys(state.maps);
  const snaps = await Promise.all(ids.map((id) => get(ref(db, `ratings/${id}/${uid}`))));
  state.mine = {};
  snaps.forEach((s, i) => { if (s.exists()) state.mine[ids[i]] = s.val(); });
  render();
}

$("grid").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-map]");
  if (b) vote(b.dataset.map, Number(b.dataset.val));
});
$("cats").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-cat]");
  if (!b) return;
  state.cat = b.dataset.cat; renderCats(); render();
});
$("search").addEventListener("input", (e) => { state.q = e.target.value; render(); });
$("sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });

$("authBtn").addEventListener("click", async () => {
  try {
    if (state.user) await signOut(auth);
    else await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    setStatus(`Sign-in failed: ${err.message}`, true);
  }
});

onAuthStateChanged(auth, (user) => {
  state.user = user;
  $("authBtn").hidden = false;
  if (!user) {
    state.mine = {};
    $("who").textContent = "Sign in to rate maps";
    $("authBtn").textContent = "Sign in with Google";
    render();
    return;
  }
  $("who").textContent = user.displayName || user.email || "Signed in";
  $("authBtn").textContent = "Sign out";
  setStatus("");
  if (Object.keys(state.maps).length) loadMine(user.uid).catch((e) => setStatus(e.message, true));
});

(async function init() {
  setStatus("Loading maps…");
  try {
    const snap = await get(ref(db, "mapList"));
    state.maps = snap.val() || {};
    renderCats();
    setStatus(Object.keys(state.maps).length ? "" : "No maps found. Import mapList.json into your database.");
    render();
    if (state.user) loadMine(state.user.uid).catch((e) => setStatus(e.message, true));
    onValue(ref(db, "stats"), (s) => { state.stats = s.val() || {}; render(); },
      (err) => setStatus(`Couldn’t load ratings: ${err.message}`, true));
  } catch (err) {
    setStatus(`Couldn’t reach the database: ${err.message}`, true);
  }
})();

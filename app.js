import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
	getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
	getDatabase, ref, get, set, remove, onValue, update, push, serverTimestamp, query, limitToLast
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
//hi pusheen
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

const minVotes = 2;
const tiers = [
	{ name: "S", min: 6 }, { name: "A", min: 5 }, { name: "B", min: 4 },
	{ name: "C", min: 3 }, { name: "D", min: 2 }, { name: "F", min: 0 }
];
const maxCharacters = 200000;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const $ = (id) => document.getElementById(id);
const state = {
	maps: {},
	mapFiles: {},
	files: {},
	ratings: {},
	aliases: {},
	cat: "all",
	q: "",
	sort: "name",
	user: null,
	admin: false
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
	"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
const fmtSize = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
const isUp = (id) => id in state.files;
const titleOf = (id) => (isUp(id) ? state.files[id].name.replace(/\.js$/i, "") : id);

const aliasOf = (uid) => state.aliases[uid] || "Anonymous";
const onSite = () => window.location.href == "https://whyisthisnotavalable.github.io/n-vote/";

const cmCounts = {};
const countTip = (n) => (n === undefined ? "Counting…" : n === 0 ? "No comments yet" : `${n} comment${n === 1 ? "" : "s"}`);

function setStatus(msg, isError = false) {
	const el = $("status");
	el.textContent = msg;
	el.classList.toggle("error", isError);
}

function setFileStatus(msg, isError = false) {
	const el = $("fileStatus");
	el.textContent = msg;
	el.classList.toggle("error", isError);
}

function statsOf(id) {
	const vals = Object.values(state.ratings[id] || {}).filter((v) => Number.isInteger(v) && v >= 1 && v <= 7);
	return {
		sum: vals.reduce((a, b) => a + b, 0),
		count: vals.length
	};
}

function mineOf(id) {
	return state.user ? (state.ratings[id] || {})[state.user.uid] || 0 : 0;
}

function tierFor(s) {
	if (!s.count || s.count < minVotes) return null;
	const avg = s.sum / s.count;
	return tiers.find((t) => avg >= t.min).name;
}

function visibleMaps() {
	const q = state.q.trim().toLowerCase();
	const pool = state.cat === "uploaded" ? Object.keys(state.files) : Object.keys(state.maps).filter((id) => state.cat === "all" || state.maps[id] === state.cat);
	const ids = pool.filter((id) => titleOf(id).toLowerCase().includes(q));
	const avg = (id) => {
		const s = statsOf(id);
		return s.count ? s.sum / s.count : -1;
	};
	const sorters = {
		name: (a, b) => titleOf(a).localeCompare(titleOf(b), undefined, {
			sensitivity: "base"
		}),
		top: (a, b) => avg(b) - avg(a),
		votes: (a, b) => statsOf(b).count - statsOf(a).count,
		unrated: (a, b) => (mineOf(a) ? 1 : 0) - (mineOf(b) ? 1 : 0),
		newest: (a, b) => (state.files[b]?.uploaded || 0) - (state.files[a]?.uploaded || 0),
		oldest: (a, b) => (state.files[a]?.uploaded || 0) - (state.files[b]?.uploaded || 0)
	};
	return ids.sort(sorters[state.sort]);
}

function card(id) {
	const up = isUp(id);
	const f = up ? state.files[id] : state.mapFiles[id];
	const s = statsOf(id);
	const tier = tierFor(s);
	const mine = mineOf(id);
	const title = esc(titleOf(id));
	const avgText = s.count ? (s.sum / s.count).toFixed(2) : "0.00";
	const countText = s.count ? `${s.count} rating${s.count === 1 ? "" : "s"}` : "No ratings yet";
	const tierHtml = tier ? `<span class="tier ${tier}" title="Tier ${tier}">${tier}</span>` : `<span class="tier none" title="Needs ${minVotes} ratings for a tier">?</span>`;
	let notches = "";
	for (let n = 1; n <= 7; n++) {
		const cls = n <= mine ? "on" : "";
		notches += `<button type="button" class="${cls}" data-map="${id}" data-val="${n}" aria-pressed="${n === mine}" aria-label="Rate ${title} ${n} out of 7" title="${n} / 7">★</button>`;
	}
	const date = up && f.uploaded ? new Date(f.uploaded).toLocaleDateString() : "";
	const sub = up ? `by ${esc(aliasOf(f.uid))} · ${fmtSize(f.size)}${date ? " · " + date : ""}` : esc(state.maps[id]);
	const canDelete = up && state.user && (f.uid === state.user.uid || state.admin);
	const actions = `<button type="button" data-cm="${id}" data-tip="${countTip(cmCounts[id]?.n)}">Comments</button>` + (f ? `<button type="button" data-dl="${id}" data-tip="File size: ${fmtSize(f.size)}" aria-label="Download, file size ${fmtSize(f.size)}">Download</button>` : "") + (canDelete ? `<button type="button" class="danger" data-del="${id}">Delete</button>` : "");
	return `<article class="card">
	<header><div><h2>${title}</h2><span class="cat">${sub}</span></div>${tierHtml}</header>
	${up && f.description ? `<p class="desc">${esc(f.description)}</p>` : ""}
	<p class="avg"><b>${avgText}</b> · ${countText}${mine ? ` · yours: ${mine}` : ""}</p>
	<div class="rate">${notches}</div>
	${actions ? `<div class="card-actions">${actions}</div>` : ""}
  </article>`;
}

let filterText = "";

function render() {
	const ids = visibleMaps();
	$("grid").innerHTML = ids.map(card).join("");
	if (!ids.length && Object.keys(state.maps).length) {
		filterText = state.cat === "uploaded" && !Object.keys(state.files).length ? "No uploaded maps yet." : "No maps match your filters.";
		setStatus(filterText);
	}
	else if (filterText) {
		if ($("status").textContent === filterText) setStatus("");
		filterText = "";
	}
}
let queued = false;

function scheduleRender() {
	if (queued) return;
	queued = true;
	requestAnimationFrame(() => {
		queued = false;
		render();
	});
}

function renderSort() {
	const up = state.cat === "uploaded";
	if (!up && (state.sort === "newest" || state.sort === "oldest")) state.sort = "name";
	$("sort").innerHTML = (up ? `<option value="newest">Newest uploaded</option><option value="oldest">Oldest uploaded</option>` : "") + `<option value="name">Sort by name</option><option value="top">Highest rated</option><option value="votes">Most votes</option><option value="unrated">Not rated by me</option>`;
	$("sort").value = state.sort;
}

function renderCats() {
	const cats = ["all", ...new Set(Object.values(state.maps)), "uploaded"];
	const label = (c) => (c === "all" ? "All" : c === "uploaded" ? "Uploaded maps" : c[0].toUpperCase() + c.slice(1));
	$("cats").innerHTML = cats.map((c) => `<button type="button" data-cat="${c}" aria-pressed="${c === state.cat}">${label(c)}</button>`).join("");
}

function updateWho() {
	if (!onSite()) return;
	const u = state.user;
	$("aliasBtn").hidden = !u;
	$("who").textContent = !u ? "Sign in to rate maps" : (state.aliases[u.uid] || "No nickname yet") + (state.admin ? " (admin)" : "");
}

let targetsKey = "";
function renderUpload() {
	$("upload").hidden = !state.user;
	$("uploadHint").hidden = !!state.user;
	const key = state.admin ? "a:" + Object.keys(state.maps).join(",") : "";
	if (key === targetsKey) return;
	targetsKey = key;
	$("targetRow").innerHTML = state.admin ? `<label>Upload as <select id="target"><option value="">New uploaded map</option>` + Object.keys(state.maps).sort((a, b) => a.localeCompare(b, undefined, {
		sensitivity: "base"
	})).map((id) => `<option value="${esc(id)}">Official map: ${esc(id)}</option>`).join("") + `</select></label>` : "";
}

const rateSubs = {};
function watchRatings(id) {
	if (rateSubs[id]) return;
	rateSubs[id] = onValue(ref(db, `ratings/${id}`), (s) => {
		state.ratings[id] = s.val() || {};
		scheduleRender();
	}, (err) => setStatus(`Could not load ratings: ${err.message}`, true));
}

function unwatchRatings(id) {
	rateSubs[id]();
	delete rateSubs[id];
	delete state.ratings[id];
}
async function vote(mapId, value) {
	if (!state.user) return setStatus(window.location.href != "https://whyisthisnotavalable.github.io/n-vote/" ? "go to the actual website to login with google and vote" : "sign in with Google to rate maps.", true);
	const next = mineOf(mapId) === value ? null : value;
	const r = ref(db, `ratings/${mapId}/${state.user.uid}`);
	try {
		if (next === null) await remove(r);
		else await set(r, next);
		setStatus(next === null ? `Removed your rating for ${titleOf(mapId)}.` : `Rated ${titleOf(mapId)} ${next}/7.`);
	}
	catch (err) {
		setStatus(`Couldn’t save your rating: ${err.message}`, true);
	}
}
async function uploadFile() {
	if (!state.user) return setFileStatus("Sign in with Google to upload.", true);
	if (!state.aliases[state.user.uid]) return setFileStatus("Set a nickname first (the Nickname button at the top).", true);
	const f = $("file").files[0];
	if (!f) return setFileStatus("Choose a .js file first.", true);
	if (!/\.js$/i.test(f.name)) return setFileStatus("Only .js files are allowed.", true);
	const text = await f.text();
	if (!text.length) return setFileStatus("That file is empty.", true);
	if (text.length > maxCharacters) return setFileStatus(`File is too large (limit ${maxCharacters / 1000} KB).`, true);
	const target = $("target")?.value || "";
	if (target && !state.admin) return setFileStatus("Only richard can upload files for official maps.", true);
	$("uploadBtn").disabled = true;
	try {
		if (target) {
			await update(ref(db), {
				[`mapFiles/${target}`]: {
					name: `${target}.js`,
					size: text.length,
					uploaded: serverTimestamp()
				},
				[`mapFileData/${target}`]: {
					text
				}
			});
			setFileStatus(`Uploaded the file for ${target}. It is now that map’s download.`);
		}
		else {
			const name = f.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(-60);
			const desc = $("desc").value.trim().slice(0, 300);
			const id = push(ref(db, "files")).key;
			const meta = {
				name,
				size: text.length,
				uid: state.user.uid,
				uploaded: serverTimestamp()
			};
			if (desc) meta.description = desc;
			await update(ref(db), {
				[`files/${id}`]: meta,
				[`fileData/${id}`]: {
					uid: state.user.uid,
					text
				}
			});
			setFileStatus(`Uploaded ${name}. You can find it under the Uploaded maps tab.`);
		}
		$("file").value = "";
		$("desc").value = "";
	}
	catch (err) {
		setFileStatus(`Upload failed: ${err.message}`, true);
	}
	finally {
		$("uploadBtn").disabled = false;
	}
}
async function downloadFile(id) {
	const up = isUp(id);
	try {
		const snap = await get(ref(db, `${up ? "fileData" : "mapFileData"}/${id}`));
		if (!snap.exists()) return setStatus("That file no longer exists.", true);
		const blob = new Blob([snap.val().text], {
			type: "text/plain"
		});
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = (up ? state.files[id] : state.mapFiles[id])?.name || "map.js";
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}
	catch (err) {
		setStatus(`Download failed: ${err.message}`, true);
	}
}
async function deleteFile(id) {
	if (!confirm(`Delete ${titleOf(id)}?`)) return;
	const updates = {
		[`files/${id}`]: null,
		[`fileData/${id}`]: null
	};
	if (state.admin) {
		updates[`ratings/${id}`] = null;
		updates[`comments/${id}`] = null;
	}
	try {
		await update(ref(db), updates);
		setStatus("Deleted.");
	}
	catch (err) {
		setStatus(`Couldn’t delete: ${err.message}`, true);
	}
}

const aliasOk = /^[A-Za-z0-9][A-Za-z0-9_ -]{0,22}[A-Za-z0-9]$/;

function setAliasStatus(msg, isError = false) {
	const el = $("aliasStatus");
	el.textContent = msg;
	el.classList.toggle("error", isError);
}
async function saveAlias() {
	if (!state.user) return;
	const name = $("aliasInput").value.trim().replace(/\s+/g, " ");
	if (!aliasOk.test(name)) return setAliasStatus("Use 2–24 characters: letters, numbers, spaces, - and _. Start and end with a letter or number.", true);
	const uid = state.user.uid;
	const key = name.toLowerCase();
	const oldKey = (state.aliases[uid] || "").toLowerCase();
	$("aliasSave").disabled = true;
	try {
		try {
			await set(ref(db, `aliasTaken/${key}`), uid);
		}
		catch (err) {
			return setAliasStatus("That nickname is taken or not allowed. Try another.", true);
		}
		try {
			await set(ref(db, `aliases/${uid}`), name);
		}
		catch (err) {
			if (key !== oldKey) remove(ref(db, `aliasTaken/${key}`)).catch(() => {});
			return setAliasStatus(`Couldn’t save: ${err.message}`, true);
		}
		if (oldKey && oldKey !== key) remove(ref(db, `aliasTaken/${oldKey}`)).catch(() => {});
		$("aliasDialog").close();
		setStatus(`Your nickname is now ${name}.`);
	}
	finally {
		$("aliasSave").disabled = false;
	}
}
$("aliasBtn").addEventListener("click", () => {
	$("aliasInput").value = state.aliases[state.user.uid] || "";
	setAliasStatus("");
	$("aliasDialog").showModal();
});
$("aliasClose").addEventListener("click", () => $("aliasDialog").close());
$("aliasSave").addEventListener("click", saveAlias);
$("aliasInput").addEventListener("keydown", (e) => {
	if (e.key === "Enter") saveAlias();
});

const cm = {
	id: null,
	unsub: null,
	list: {}
};

function setCommentStatus(msg, isError = false) {
	const el = $("commentStatus");
	el.textContent = msg;
	el.classList.toggle("error", isError);
}

function renderComments() {
	if (!cm.id) return;
	const list = Object.entries(cm.list).map(([id, c]) => ({
		id,
		...c
	})).sort((a, b) => (a.time || 0) - (b.time || 0));
	$("commentList").innerHTML = list.length ? list.map((c) => {
		const canDel = state.user && (c.uid === state.user.uid || state.admin);
		const when = c.time ? new Date(c.time).toLocaleString() : "";
		return `<div class="comment"><div class="meta"><span><b>${esc(aliasOf(c.uid))}</b> · ${esc(when)}</span>${canDel ? `<button type="button" data-cdel="${esc(c.id)}">Delete</button>` : ""}</div><p>${esc(c.text)}</p></div>`;
	}).join("") : `<p class="status">No comments yet.</p>`;
	const hasAlias = !!state.user && !!state.aliases[state.user.uid];
	$("commentForm").hidden = !hasAlias;
	$("commentHint").hidden = hasAlias;
	$("commentHint").textContent = state.user ? "Set a nickname (top right) to comment." : "Sign in with Google to comment.";
}

function closeCommentsSub() {
	if (cm.unsub) cm.unsub();
	cm.unsub = null;
	cm.id = null;
}

function openComments(id) {
	closeCommentsSub();
	cm.id = id;
	cm.list = {};
	$("commentTitle").textContent = `Comments: ${titleOf(id)}`;
	setCommentStatus("");
	renderComments();
	cm.unsub = onValue(query(ref(db, `comments/${id}`), limitToLast(100)), (s) => {
		cm.list = s.val() || {};
		const n = Object.keys(cm.list).length;
		if (n < 100) {
			cmCounts[cm.id] = { n, t: Date.now() };
			scheduleRender();
		}
		renderComments();
		$("commentList").scrollTop = $("commentList").scrollHeight;
	}, (err) => setCommentStatus(`Could not load comments: ${err.message}`, true));
	$("commentsDialog").showModal();
}
async function postComment() {
	if (!state.user || !cm.id) return;
	const text = $("commentText").value.trim();
	if (!text) return;
	if (text.length > 500) return setCommentStatus("Comments can be up to 500 characters.", true);
	$("commentPost").disabled = true;
	try {
		const cid = push(ref(db, `comments/${cm.id}`)).key;
		await set(ref(db, `comments/${cm.id}/${cid}`), {
			uid: state.user.uid,
			text,
			time: serverTimestamp()
		});
		$("commentText").value = "";
		setCommentStatus("");
	}
	catch (err) {
		setCommentStatus(`Couldn’t post: ${err.message}`, true);
	}
	finally {
		$("commentPost").disabled = false;
	}
}
$("commentPost").addEventListener("click", postComment);
$("commentsClose").addEventListener("click", () => $("commentsDialog").close());
$("commentsDialog").addEventListener("close", closeCommentsSub);
$("commentList").addEventListener("click", async (e) => {
	const b = e.target.closest("button[data-cdel]");
	if (!b || !cm.id) return;
	try {
		await remove(ref(db, `comments/${cm.id}/${b.dataset.cdel}`));
	}
	catch (err) {
		setCommentStatus(`Couldn’t delete: ${err.message}`, true);
	}
});

const countPending = new Set();
async function loadCommentCount(id) {
	const hit = cmCounts[id];
	if ((hit && Date.now() - hit.t < 60000) || countPending.has(id)) return;
	countPending.add(id);
	try {
		const res = await fetch(`${firebaseConfig.databaseURL}/comments/${id}.json?shallow=true`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		cmCounts[id] = { n: data ? Object.keys(data).length : 0, t: Date.now() };
		document.querySelectorAll(`[data-cm="${id}"]`).forEach((el) => {
			el.dataset.tip = countTip(cmCounts[id].n);
		});
	}
	catch (err) {
		document.querySelectorAll(`[data-cm="${id}"]`).forEach((el) => {
			el.dataset.tip = "Couldn’t load the count";
		});
	}
	finally {
		countPending.delete(id);
	}
}
const hoverCount = (e) => {
	const b = e.target.closest("button[data-cm]");
	if (b) loadCommentCount(b.dataset.cm);
};
$("grid").addEventListener("mouseover", hoverCount);
$("grid").addEventListener("focusin", hoverCount);
$("grid").addEventListener("click", (e) => {
	const b = e.target.closest("button[data-map]");
	if (b) return vote(b.dataset.map, Number(b.dataset.val));
	const d = e.target.closest("button[data-dl]");
	if (d) return downloadFile(d.dataset.dl);
	const x = e.target.closest("button[data-del]");
	if (x) return deleteFile(x.dataset.del);
	const c = e.target.closest("button[data-cm]");
	if (c) openComments(c.dataset.cm);
});
$("cats").addEventListener("click", (e) => {
	const b = e.target.closest("button[data-cat]");
	if (!b) return;
	if (b.dataset.cat === "uploaded" && state.cat !== "uploaded" && state.sort === "name") state.sort = "newest";
	state.cat = b.dataset.cat;
	renderCats();
	renderSort();
	render();
});
$("search").addEventListener("input", (e) => {
	state.q = e.target.value;
	render();
});
$("sort").addEventListener("change", (e) => {
	state.sort = e.target.value;
	render();
});
$("rules").addEventListener("click", () => $("rulesDialog").showModal());
$("rulesClose").addEventListener("click", () => $("rulesDialog").close());
$("filesBtn").addEventListener("click", () => $("filesDialog").showModal());
$("filesClose").addEventListener("click", () => $("filesDialog").close());
$("filesDialog").addEventListener("click", (e) => {
	if (e.target === $("filesDialog")) $("filesDialog").close();
});
$("uploadBtn").addEventListener("click", uploadFile);
$("authBtn").addEventListener("click", async () => {
	try {
		if (state.user) await signOut(auth);
		else await signInWithPopup(auth, new GoogleAuthProvider());
	}
	catch (err) {
		setStatus(`Sign-in failed: ${err.message}`, true);
	}
});
onAuthStateChanged(auth, (user) => {
	if (!onSite()) {
		$("who").textContent = "not on my website. no voting for you";
		return
	};
	state.user = user;
	state.admin = false;
	$("authBtn").hidden = false;
	if (!user) {
		$("who").textContent = "Sign in to rate maps";
		$("authBtn").textContent = "Sign in with Google";
	}
	else {
		$("authBtn").textContent = "Sign out";
		setStatus("");
		get(ref(db, `admins/${user.uid}`)).then((s) => {
			state.admin = s.exists();
			updateWho();
			renderUpload();
			scheduleRender();
		}).catch((err) => {
			console.error(err);
			setStatus(`Couldn’t check admin status: ${err.message}`, true);
		});
	}
	render();
	renderUpload();
	updateWho();
	renderComments();
});

onValue(ref(db, "aliases"), (s) => {
	state.aliases = s.val() || {};
	updateWho();
	scheduleRender();
	renderComments();
}, (err) => setStatus(`Could not load nicknames: ${err.message}`, true));
onValue(ref(db, "files"), (s) => {
	state.files = s.val() || {};
	for (const id of Object.keys(state.files)) watchRatings(id);
	for (const id of Object.keys(rateSubs)) {
		if (!(id in state.maps) && !(id in state.files)) unwatchRatings(id);
	}
	scheduleRender();
}, (err) => setStatus(`Could not load uploaded maps: ${err.message}`, true));
onValue(ref(db, "mapFiles"), (s) => {
	state.mapFiles = s.val() || {};
	scheduleRender();
}, (err) => setStatus(`Could not load map files: ${err.message}`, true));

(async function init() {
	setStatus("Loading maps…");
	try {
		const snap = await get(ref(db, "mapList"));
		state.maps = snap.val() || {};
		renderCats();
		renderUpload();
		setStatus(Object.keys(state.maps).length ? "" : "no maps found. go ping richard on discord because something probably broke");
		render();
		for (const id of Object.keys(state.maps)) watchRatings(id);
	}
	catch (err) {
		setStatus(`Could not reach the database: ${err.message}`, true);
	}
})();
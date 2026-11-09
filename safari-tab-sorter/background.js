importScripts("classify.js", "ai.js");

const api = globalThis.browser ?? globalThis.chrome;
const GROUP_COLORS = ["blue", "green", "orange", "purple", "red", "cyan", "pink", "yellow", "grey"];

// Safari bietet Erweiterungen (Stand 2026) keine Tabgruppen-API.
// Dann wird jede Kategorie ein eigenes Fenster. Wo es die API gibt
// (Chrome, Edge, Firefox), entstehen echte Tabgruppen.
const hasTabGroups = () => !!(api.tabGroups && api.tabs.group);

async function getSettings() {
  const { settings } = await api.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

// Fenster-IDs gelten nur bis zum Neustart des Browsers → Sitzungsspeicher.
const stateStore = () => api.storage.session ?? api.storage.local;

async function getState() {
  const { state } = await stateStore().get("state");
  return { catWindows: {}, excludedWindows: [], ...(state || {}) };
}

async function setState(state) {
  await stateStore().set({ state });
}

const lower = (s) => String(s || "").trim().toLowerCase();

function isExcludedName(name, settings) {
  const n = lower(name);
  return !!n && settings.excluded.some((e) => lower(e) === n);
}

async function windowExists(id) {
  try {
    await api.windows.get(id);
    return true;
  } catch {
    return false;
  }
}

// Zu welcher Kategorie gehört dieses Fenster (nur Fenster-Modus)?
function categoryOfWindow(windowId, state) {
  return Object.keys(state.catWindows).find((k) => state.catWindows[k] === windowId) || null;
}

async function groupTitles(windowId) {
  const map = new Map();
  if (!hasTabGroups()) return map;
  const groups = await api.tabGroups.query({ windowId });
  for (const g of groups) map.set(g.id, g.title || "");
  return map;
}

// ---------- KI-Zuordnung ----------
const useAI = (settings) => settings.aiEnabled !== false && !!settings.apiKey;

// Merkt sich KI-Ergebnisse 15 Minuten, damit „Vorschau“ und danach
// „Jetzt sortieren“ nicht zweimal bezahlt werden.
const aiCache = new Map();
const AI_CACHE_MS = 15 * 60 * 1000;
const cacheKey = (tab, settings) =>
  JSON.stringify([tab.url, tab.title, settings.categories, settings.strictness]);

// Liest Beschreibung und Textanfang der Seite (nur http/https).
async function pageSnippet(tab) {
  if (!api.scripting || !/^https?:/.test(tab.url || "") || tab.discarded) return "";
  const read = api.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const meta = document.querySelector('meta[name="description"], meta[property="og:description"]');
      const desc = meta ? meta.getAttribute("content") || "" : "";
      const body = (document.body ? document.body.innerText : "").replace(/\s+/g, " ").trim();
      return (desc + " | " + body).slice(0, 600);
    }
  }).then((r) => (r && r[0] && r[0].result) || "").catch(() => "");
  const timeout = new Promise((res) => setTimeout(() => res(""), 1500));
  return Promise.race([read, timeout]);
}

async function decide(tabs, settings, result) {
  const decisions = new Map();
  if (!useAI(settings)) {
    result.engine = "regeln";
    for (const t of tabs) decisions.set(t.id, classifyTab(t, settings));
    return decisions;
  }

  result.engine = "ki";
  const now = Date.now();
  const open = [];
  for (const t of tabs) {
    const hit = aiCache.get(cacheKey(t, settings));
    if (hit && now - hit.at < AI_CACHE_MS) decisions.set(t.id, hit.category);
    else if (/^https?:/.test(t.url || "")) open.push(t);
    else decisions.set(t.id, null); // about:, chrome:// usw. bleiben stehen
  }
  if (!open.length) return decisions;

  try {
    const items = await Promise.all(open.map(async (t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      snippet: settings.readContent !== false ? await pageSnippet(t) : ""
    })));
    const ai = await classifyWithAI(items, settings);
    for (const t of open) {
      const category = ai.get(t.id)?.category || null;
      decisions.set(t.id, category);
      aiCache.set(cacheKey(t, settings), { category, at: now });
    }
  } catch (e) {
    // KI nicht erreichbar → auf Stichwortregeln zurückfallen
    result.engine = "regeln";
    result.aiError = String(e && e.message ? e.message : e);
    for (const t of open) decisions.set(t.id, classifyTab(t, settings));
  }
  return decisions;
}

// Plant, was mit jedem Tab passieren soll – ohne etwas zu verändern.
async function plan(windowId, settings, state, onlyTabIds) {
  const result = { mode: hasTabGroups() ? "groups" : "windows", moves: [], stay: [], skipped: [], windowExcluded: false };

  if (state.excludedWindows.includes(windowId)) {
    result.windowExcluded = true;
    return result;
  }
  const winCat = categoryOfWindow(windowId, state);
  if (winCat && isExcludedName(winCat, settings)) {
    result.windowExcluded = true;
    return result;
  }

  const titles = await groupTitles(windowId);
  let tabs = await api.tabs.query({ windowId });
  if (onlyTabIds) tabs = tabs.filter((t) => onlyTabIds.includes(t.id));

  // 1. Tabs aussortieren, die nie angefasst werden
  const candidates = [];
  for (const tab of tabs) {
    const info = { id: tab.id, title: tab.title || tab.url, url: tab.url };
    if (tab.pinned) {
      result.skipped.push({ ...info, reason: "angeheftet" });
      continue;
    }
    const currentGroup = tab.groupId != null && tab.groupId !== -1 ? titles.get(tab.groupId) : null;
    if (currentGroup != null && isExcludedName(currentGroup, settings)) {
      result.skipped.push({ ...info, reason: `Gruppe „${currentGroup}“ ausgeschlossen` });
      continue;
    }
    candidates.push({ tab, info, currentGroup });
  }

  // 2. Zuordnen – per KI, wenn eingerichtet, sonst per Stichwortregeln
  const decisions = await decide(candidates.map((c) => c.tab), settings, result);

  // 3. Ergebnis aufbereiten
  for (const { tab, info, currentGroup } of candidates) {
    const cat = decisions.get(tab.id) || null;
    if (!cat) {
      result.stay.push(info);
      continue;
    }
    if (isExcludedName(cat, settings)) {
      result.skipped.push({ ...info, reason: `Kategorie „${cat}“ ausgeschlossen` });
      continue;
    }
    const already = result.mode === "groups" ? lower(currentGroup) === lower(cat) : lower(winCat) === lower(cat);
    if (already) continue;
    result.moves.push({ ...info, category: cat });
  }
  return result;
}

async function applyGroups(windowId, moves, settings) {
  const byCat = groupBy(moves);
  const existing = await api.tabGroups.query({ windowId });
  for (const [cat, tabIds] of byCat) {
    const group = existing.find((g) => lower(g.title) === lower(cat));
    if (group) {
      await api.tabs.group({ groupId: group.id, tabIds });
    } else {
      const groupId = await api.tabs.group({ tabIds, createProperties: { windowId } });
      const idx = settings.categories.findIndex((c) => lower(c.name) === lower(cat));
      await api.tabGroups.update(groupId, {
        title: cat,
        color: GROUP_COLORS[Math.max(idx, 0) % GROUP_COLORS.length],
        collapsed: false
      });
    }
  }
}

async function applyWindows(moves, state) {
  const byCat = groupBy(moves);
  for (const [cat, tabIds] of byCat) {
    let target = state.catWindows[cat];
    if (target != null && !(await windowExists(target))) target = null;
    if (target == null) {
      const [first, ...rest] = tabIds;
      const win = await api.windows.create({ tabId: first, focused: false });
      target = win.id;
      if (rest.length) await api.tabs.move(rest, { windowId: target, index: -1 });
    } else {
      await api.tabs.move(tabIds, { windowId: target, index: -1 });
    }
    state.catWindows[cat] = target;
  }
  await setState(state);
}

function groupBy(moves) {
  const map = new Map();
  for (const m of moves) {
    if (!map.has(m.category)) map.set(m.category, []);
    map.get(m.category).push(m.id);
  }
  return map;
}

async function sortWindow(windowId, onlyTabIds) {
  const settings = await getSettings();
  const state = await getState();
  const p = await plan(windowId, settings, state, onlyTabIds);
  if (p.moves.length) {
    if (p.mode === "groups") await applyGroups(windowId, p.moves, settings);
    else await applyWindows(p.moves, state);
  }
  return p;
}

// ---------- Links einfügen (z. B. aus Safari kopiert) ----------
function extractUrls(text) {
  const found = String(text || "").match(/https?:\/\/[^\s<>"']+/gi) || [];
  const seen = new Set();
  return found
    .map((u) => u.replace(/[),.;]+$/, ""))
    .filter((u) => {
      try {
        new URL(u);
      } catch {
        return false;
      }
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    });
}

function waitForLoaded(tabIds, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const open = new Set(tabIds);
    const done = () => {
      api.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (id, change) => {
      if (change.status === "complete" && open.delete(id) && !open.size) done();
    };
    const timer = setTimeout(done, timeoutMs);
    api.tabs.onUpdated.addListener(listener);
    // Bereits fertig geladene Tabs sofort abhaken
    Promise.all(tabIds.map((id) => api.tabs.get(id).catch(() => null))).then((tabs) => {
      for (const t of tabs) if (!t || t.status === "complete") open.delete(t ? t.id : null);
      if (!open.size) done();
    });
  });
}

async function importLinks(windowId, text) {
  const urls = extractUrls(text);
  if (!urls.length) return { error: "Keine Links gefunden. Kopiere die Tabs in Safari und füge sie hier ein." };
  const ids = [];
  for (const url of urls) {
    const tab = await api.tabs.create({ windowId, url, active: false });
    ids.push(tab.id);
  }
  // Warten, bis die Seiten geladen sind – dann stehen auch die Titel fest.
  await waitForLoaded(ids);
  const result = await sortWindow(windowId, ids);
  return { ...result, opened: urls.length };
}

// ---------- Nachrichten vom Popup ----------
api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    const settings = await getSettings();
    const state = await getState();
    switch (msg.type) {
      case "preview":
        return plan(msg.windowId, settings, state);
      case "sort":
        return sortWindow(msg.windowId);
      case "importLinks":
        return importLinks(msg.windowId, msg.text);
      case "testAI": {
        const s = { ...settings, ...(msg.settings || {}) };
        if (!s.apiKey) return { error: "Kein API-Key eingetragen." };
        return testAI(s, { title: msg.title || "", url: msg.url });
      }
      case "toggleWindowExclusion": {
        const i = state.excludedWindows.indexOf(msg.windowId);
        if (i >= 0) state.excludedWindows.splice(i, 1);
        else state.excludedWindows.push(msg.windowId);
        await setState(state);
        return { excluded: i < 0 };
      }
      case "status":
        return {
          mode: hasTabGroups() ? "groups" : "windows",
          ai: useAI(settings),
          windowExcluded: state.excludedWindows.includes(msg.windowId),
          windowCategory: categoryOfWindow(msg.windowId, state)
        };
    }
  })()
    .then(sendResponse)
    .catch((e) => sendResponse({ error: String(e && e.message ? e.message : e) }));
  return true;
});

// ---------- Automatik ----------
// Ein Tab wird erst einsortiert, wenn er fertig geladen ist und nicht
// gerade angezeigt wird – sonst würde er einem unter den Händen weggezogen.
const pending = new Set();
const lastActive = new Map();

async function autoSort(tabId) {
  const settings = await getSettings();
  if (!settings.auto) return;
  try {
    const tab = await api.tabs.get(tabId);
    if (tab.status !== "complete" || tab.pinned) return;
    if (tab.active) {
      pending.add(tabId);
      return;
    }
    pending.delete(tabId);
    await sortWindow(tab.windowId, [tabId]);
  } catch {
    pending.delete(tabId);
  }
}

api.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "complete") autoSort(tabId);
});

api.tabs.onActivated.addListener(({ tabId, windowId }) => {
  const prev = lastActive.get(windowId);
  lastActive.set(windowId, tabId);
  if (prev != null && prev !== tabId && pending.has(prev)) autoSort(prev);
});

api.tabs.onRemoved.addListener((tabId) => pending.delete(tabId));

api.windows.onRemoved.addListener(async (windowId) => {
  const state = await getState();
  let changed = false;
  for (const k of Object.keys(state.catWindows)) {
    if (state.catWindows[k] === windowId) {
      delete state.catWindows[k];
      changed = true;
    }
  }
  const i = state.excludedWindows.indexOf(windowId);
  if (i >= 0) {
    state.excludedWindows.splice(i, 1);
    changed = true;
  }
  if (changed) await setState(state);
});

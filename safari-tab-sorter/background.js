importScripts("classify.js");

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
    const cat = classifyTab(tab, settings);
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

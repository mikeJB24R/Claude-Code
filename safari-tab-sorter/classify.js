// Ordnet einen Tab einer Kategorie zu – oder gibt null zurück, wenn unsicher.
// Wird vom Hintergrundskript und von den Tests verwendet.

const DEFAULT_SETTINGS = {
  mainName: "Allgemein",
  categories: [
    { name: "Arbeit", keywords: ["github.com", "notion.so", "jira", "confluence", "slack.com"] },
    { name: "News", keywords: ["spiegel.de", "tagesschau.de", "zeit.de", "nachrichten"] },
    { name: "Shopping", keywords: ["amazon.de", "ebay.de", "warenkorb", "shop"] }
  ],
  excluded: [],
  strictness: 2,
  auto: false
};

function normalizeKeyword(k) {
  return String(k || "").trim().toLowerCase();
}

function isDomainKeyword(k) {
  return k.includes(".") && !k.includes(" ");
}

function scoreTab(tab, category) {
  let url;
  try {
    url = new URL(tab.url || "");
  } catch {
    return 0;
  }
  if (!/^https?:$/.test(url.protocol)) return 0;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = (url.pathname + url.search).toLowerCase();
  const title = (tab.title || "").toLowerCase();
  let score = 0;

  for (const raw of category.keywords || []) {
    const k = normalizeKeyword(raw);
    if (!k) continue;
    if (isDomainKeyword(k)) {
      const d = k.replace(/^www\./, "");
      if (host === d || host.endsWith("." + d)) score += 3;
    } else {
      if (host.includes(k)) score += 2;
      if (title.includes(k)) score += 1;
      if (path.includes(k)) score += 1;
    }
  }
  return score;
}

// Liefert den Kategorienamen oder null (= unsicher → Hauptgruppe).
function classifyTab(tab, settings) {
  const threshold = settings.strictness ?? 2;
  const scored = (settings.categories || [])
    .filter((c) => c.name && c.name.trim())
    .map((c) => ({ name: c.name.trim(), score: scoreTab(tab, c) }))
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  const [best, second] = scored;
  if (best.score < threshold) return null;
  if (second && second.score === best.score) return null; // Gleichstand = unsicher
  return best.name;
}

if (typeof module !== "undefined") {
  module.exports = { classifyTab, scoreTab, DEFAULT_SETTINGS };
}

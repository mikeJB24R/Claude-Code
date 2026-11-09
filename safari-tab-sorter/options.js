const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

function addCategoryRow(cat = { name: "", keywords: [] }) {
  const node = $("catTpl").content.firstElementChild.cloneNode(true);
  node.querySelector(".name").value = cat.name;
  node.querySelector(".keywords").value = (cat.keywords || []).join(", ");
  node.querySelector(".remove").addEventListener("click", () => {
    node.remove();
    runTest();
  });
  node.addEventListener("input", runTest);
  $("categories").appendChild(node);
}

function readForm() {
  const categories = [...document.querySelectorAll(".cat")]
    .map((el) => ({
      name: el.querySelector(".name").value.trim(),
      keywords: el.querySelector(".keywords").value.split(",").map((k) => k.trim()).filter(Boolean)
    }))
    .filter((c) => c.name);
  return {
    categories,
    strictness: Number($("strictness").value),
    mainName: $("mainName").value.trim() || "Allgemein",
    excluded: $("excluded").value.split("\n").map((s) => s.trim()).filter(Boolean),
    apiKey: $("apiKey").value.trim(),
    aiEnabled: $("aiEnabled").checked,
    readContent: $("readContent").checked
  };
}

function runTest() {
  const url = $("testUrl").value.trim();
  if (!url) return;
  const s = readForm();
  const tab = { url: /^https?:\/\//.test(url) ? url : "https://" + url, title: $("testTitle").value };
  const scores = s.categories.map((c) => `${c.name}: ${scoreTab(tab, c)}`).join(" · ");
  const cat = classifyTab(tab, s);
  const excluded = cat && s.excluded.some((e) => e.toLowerCase() === cat.toLowerCase());
  $("testResult").textContent = "Regeln " + (cat
    ? excluded ? `→ „${cat}“, aber ausgeschlossen – bleibt, wo er ist.` : `→ kommt nach „${cat}“.`
    : `→ unsicher, bleibt in „${s.mainName}“.`) + (scores ? `  (Punkte: ${scores})` : "");
}

async function load() {
  const { settings } = await api.storage.local.get("settings");
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  s.categories.forEach(addCategoryRow);
  $("strictness").value = String(s.strictness);
  $("mainName").value = s.mainName;
  $("excluded").value = s.excluded.join("\n");
  $("apiKey").value = s.apiKey || "";
  $("aiEnabled").checked = s.aiEnabled !== false;
  $("readContent").checked = s.readContent !== false;
}

$("testAI").addEventListener("click", async () => {
  const url = $("testUrl").value.trim();
  if (!url) {
    $("testAIResult").textContent = "Bitte zuerst eine Adresse eingeben.";
    return;
  }
  $("testAI").disabled = true;
  $("testAIResult").textContent = "Frage Claude …";
  try {
    const r = await api.runtime.sendMessage({
      type: "testAI",
      settings: readForm(),
      url: /^https?:\/\//.test(url) ? url : "https://" + url,
      title: $("testTitle").value
    });
    $("testAIResult").textContent = r.error
      ? "Fehler: " + r.error
      : r.category
        ? `KI → „${r.category}“ (Sicherheit ${Math.round(r.confidence * 100)} %)`
        : `KI → unsicher (${Math.round((r.confidence || 0) * 100)} %), bleibt in „${readForm().mainName}“.`;
  } catch (e) {
    $("testAIResult").textContent = "Fehler: " + e.message;
  }
  $("testAI").disabled = false;
});

$("addCat").addEventListener("click", () => addCategoryRow());
$("testUrl").addEventListener("input", runTest);
$("testTitle").addEventListener("input", runTest);
$("strictness").addEventListener("change", runTest);
$("save").addEventListener("click", async () => {
  const { settings } = await api.storage.local.get("settings");
  await api.storage.local.set({ settings: { ...(settings || {}), ...readForm() } });
  $("saved").textContent = "Gespeichert ✓";
  setTimeout(() => ($("saved").textContent = ""), 2000);
});

load();

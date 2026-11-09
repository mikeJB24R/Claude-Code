const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

let windowId;
let mainName = "Allgemein";

const send = (msg) => api.runtime.sendMessage({ ...msg, windowId });

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function render(p, done) {
  const out = $("result");
  if (p.error) {
    out.innerHTML = `<p class="error">Fehler: ${esc(p.error)}</p>`;
    return;
  }
  if (p.windowExcluded) {
    out.innerHTML = `<p class="muted">Dieses Fenster ist ausgeschlossen – es wird nichts verschoben.</p>`;
    return;
  }
  const byCat = {};
  for (const m of p.moves) (byCat[m.category] ||= []).push(m);

  let html = (p.opened ? `<p><strong>${p.opened}</strong> Links geöffnet.</p>` : "") + `<p><strong>${p.moves.length}</strong> ${done ? "verschoben" : "würden verschoben"}, `
    + `<strong>${p.stay.length}</strong> bleiben in „${esc(mainName)}“`
    + (p.skipped.length ? `, <strong>${p.skipped.length}</strong> ausgeschlossen` : "") + ".</p>";

  for (const [cat, list] of Object.entries(byCat)) {
    html += `<details open><summary>${esc(cat)} (${list.length})</summary><ul>`
      + list.map((t) => `<li title="${esc(t.url)}">${esc(t.title)}</li>`).join("") + "</ul></details>";
  }
  if (p.stay.length) {
    html += `<details><summary>${esc(mainName)} – unsicher (${p.stay.length})</summary><ul>`
      + p.stay.map((t) => `<li title="${esc(t.url)}">${esc(t.title)}</li>`).join("") + "</ul></details>";
  }
  if (p.skipped.length) {
    html += `<details><summary>Ausgeschlossen (${p.skipped.length})</summary><ul>`
      + p.skipped.map((t) => `<li title="${esc(t.url)}">${esc(t.title)} <span class="muted">– ${esc(t.reason)}</span></li>`).join("")
      + "</ul></details>";
  }
  out.innerHTML = html;
}

async function init() {
  const win = await api.windows.getCurrent();
  windowId = win.id;
  const { settings } = await api.storage.local.get("settings");
  mainName = settings?.mainName || "Allgemein";
  $("auto").checked = !!settings?.auto;

  const status = await send({ type: "status" });
  $("excludeWindow").checked = !!status.windowExcluded;
  $("mode").textContent = status.mode === "groups"
    ? "Modus: echte Tabgruppen in diesem Fenster."
    : "Modus: ein Fenster pro Kategorie (Safari erlaubt Erweiterungen keinen Zugriff auf Tabgruppen)."
      + (status.windowCategory ? ` Dieses Fenster gehört zu „${status.windowCategory}“.` : "");
}

$("preview").addEventListener("click", async () => render(await send({ type: "preview" }), false));
$("sort").addEventListener("click", async () => {
  $("sort").disabled = true;
  render(await send({ type: "sort" }), true);
  $("sort").disabled = false;
});
$("importBox").addEventListener("toggle", () => {
  if ($("importBox").open) $("links").focus();
});
$("import").addEventListener("click", async () => {
  $("import").disabled = true;
  $("result").innerHTML = `<p class="muted">Öffne Links und warte, bis sie geladen sind …</p>`;
  const r = await send({ type: "importLinks", text: $("links").value });
  if (!r.error) {
    $("links").value = "";
    $("importBox").open = false;
  }
  render(r, true);
  $("import").disabled = false;
});
$("auto").addEventListener("change", async (e) => {
  const { settings } = await api.storage.local.get("settings");
  await api.storage.local.set({ settings: { ...(settings || {}), auto: e.target.checked } });
});
$("excludeWindow").addEventListener("change", async () => {
  const r = await send({ type: "toggleWindowExclusion" });
  $("excludeWindow").checked = r.excluded;
});
$("options").addEventListener("click", (e) => {
  e.preventDefault();
  api.runtime.openOptionsPage();
});

init();

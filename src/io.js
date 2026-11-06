// Laden und Speichern: Räume aus rooms/*.json, Layout-Download und -Upload.

// Alle JSON-Dateien im Ordner rooms/ werden beim Build eingesammelt (Änderungen laden per HMR neu).
const roomModules = import.meta.glob('../rooms/*.json', { import: 'default' });

/** Liste der verfügbaren Räume: [{ key, label }] */
export function listRooms() {
  return Object.keys(roomModules)
    .map((path) => {
      const key = path.split('/').pop().replace(/\.json$/, '');
      return { key, label: key };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

export async function loadRoom(key) {
  const entry = Object.entries(roomModules).find(([p]) => p.endsWith(`/${key}.json`));
  if (!entry) throw new Error(`Raum "${key}" nicht gefunden (rooms/${key}.json).`);
  const data = await entry[1]();
  return validate(structuredClone(data));
}

/** Prüft Pflichtfelder und ergänzt Standardwerte. Wirft bei unbrauchbaren Daten. */
export function validate(data) {
  if (!data || typeof data !== 'object') throw new Error('Keine gültige JSON-Struktur.');
  const r = data.room;
  if (!r) throw new Error('Feld "room" fehlt.');
  for (const k of ['length', 'width', 'height']) {
    if (!(Number(r[k]) > 0)) throw new Error(`room.${k} muss eine positive Zahl (cm) sein.`);
    r[k] = Number(r[k]);
  }
  data.openings = Array.isArray(data.openings) ? data.openings : [];
  for (const o of data.openings) {
    if (!['north', 'east', 'south', 'west'].includes(o.wall)) throw new Error(`Öffnung mit ungültiger Wand "${o.wall}" (north/east/south/west).`);
    if (!(o.width > 0 && o.height > 0)) throw new Error('Öffnungen brauchen width und height.');
    o.type = o.type === 'door' ? 'door' : 'window';
  }
  data.furniture = Array.isArray(data.furniture) ? data.furniture : [];
  data.furniture.forEach((f, i) => {
    for (const k of ['width', 'depth', 'height']) {
      if (!(Number(f[k]) > 0)) throw new Error(`Möbel "${f.name ?? i}": ${k} fehlt.`);
      f[k] = Number(f[k]);
    }
    f.id = f.id ?? `m${i + 1}`;
    f.name = f.name ?? `Möbel ${i + 1}`;
    f.position = {
      x: Number(f.position?.x ?? r.length / 2),
      z: Number(f.position?.z ?? r.width / 2),
    };
    f.rotation = Number(f.rotation ?? 0);
    f.elevation = Number(f.elevation ?? 0);
  });
  data.name = data.name ?? 'Raum';
  return data;
}

/** Bietet das aktuelle Layout als JSON-Datei zum Download an. */
export function downloadLayout(data) {
  const clean = structuredClone(data);
  clean.savedAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
  const stamp = clean.savedAt.slice(0, 16).replace('T', '_').replace(':', '-');
  const safeName = (clean.name || 'raum').toLowerCase().replace(/[^a-z0-9äöüß-]+/gi, '-');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName}_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Liest eine hochgeladene JSON-Datei. */
export async function readLayoutFile(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Datei ist kein gültiges JSON: ${e.message}`);
  }
  return validate(data);
}

// Einstieg: Szene, Renderer und Zusammenspiel der Module.
import * as THREE from 'three';
import { buildRoom, updateWallVisibility, setCeilingVisible } from './room.js';
import {
  createFurniture, updateTransform, checkCollisions, setSelected, setLabelsVisible, disposeObject,
} from './furniture.js';
import { createLighting, sunFromTime } from './lighting.js';
import { createControls } from './controls.js';
import { createMeasureOverlay, wallDistances } from './measure.js';
import { createUI } from './ui.js';
import { listRooms, loadRoom, downloadLayout, readLayoutFile } from './io.js';
import { WALL_LABELS } from './room.js';

// --- Renderer, Szene, Kamera ---
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfe0ef');

const camera = new THREE.PerspectiveCamera(50, 1, 2, 20000);

// --- Zustand ---
const app = {
  data: null,        // aktuelles Layout (wird beim Verschieben verändert)
  original: null,    // Ausgangsstand zum Zurücksetzen
  key: null,
  roomObj: null,
  lighting: null,
  furniture: [],
  collisions: new Map(),
  selected: null,
};

// Hochgeladene Layouts bleiben in der Raumauswahl, damit man zwischen Varianten wechseln kann
const uploads = new Map();

const measure = createMeasureOverlay(scene);

const ui = createUI({
  onRoomChange: (key) => openRoom(key),
  onSave: () => {
    downloadLayout(app.data);
    ui.toast('Layout gespeichert (Download).');
  },
  onUpload: async (file) => {
    try {
      const data = await readLayoutFile(file);
      const key = `upload:${file.name}`;
      uploads.set(key, structuredClone(data));
      setLayout(data, key);
      ui.setCurrentRoom(key, `${data.name} (${file.name})`);
      ui.toast(`Layout „${file.name}“ geladen.`);
    } catch (e) {
      ui.toast(e.message, true);
    }
  },
  onReset: () => {
    if (!app.original) return;
    setLayout(structuredClone(app.original), app.key, { keepView: true });
    ui.toast('Auf Ausgangsstand zurückgesetzt.');
  },
  onMode: (mode) => controls.setMode(mode),
  onView: (v) => (v === 'top' ? controls.viewTop() : controls.viewOverview()),
  onSnap: (on) => controls.setSnap(on),
  onCeiling: (on) => app.roomObj && setCeilingVisible(app.roomObj, on || controls.state.mode === 'walk'),
  onAutoHideWalls: () => {},
  onLabels: (on) => setLabelsVisible(app.furniture, on),
  onTime: (hour) => applyTime(hour),
  onDeselect: () => select(null),
  onEditSelected: ({ x, z, rotation }) => {
    if (!app.selected) return;
    const item = app.selected.userData.item;
    if (Number.isFinite(x)) item.position.x = x;
    if (Number.isFinite(z)) item.position.z = z;
    if (Number.isFinite(rotation)) item.rotation = ((rotation % 360) + 360) % 360;
    updateTransform(app.selected);
    refresh();
  },
});

const controls = createControls({
  camera,
  dom: canvas,
  getRoom: () => app.data.room,
  getFurniture: () => app.furniture,
  callbacks: {
    onSelect: (g) => select(g),
    onMoved: (g) => {
      updateTransform(g);
      refresh();
    },
    onDragEnd: (g) => {
      updateTransform(g);
      refresh();
    },
    onModeChange: (mode) => {
      ui.setMode(mode);
      // Beim Begehen ist die Decke immer sichtbar
      if (app.roomObj) setCeilingVisible(app.roomObj, ui.ceilingChecked || mode === 'walk');
      if (mode === 'walk') ui.setWalkLocked(false);
    },
    onWalkLock: (locked) => ui.setWalkLocked(locked),
  },
});

// --- Auswahl, Kollisionen, Maße ---
function select(group) {
  if (app.selected) setSelected(app.selected, false);
  app.selected = group;
  controls.setSelected(group);
  if (group) setSelected(group, true);
  refreshSelection();
}

function refreshSelection() {
  const g = app.selected;
  if (!g) {
    ui.showSelection(null);
    measure.clear();
    return;
  }
  const item = g.userData.item;
  ui.showSelection({
    item,
    distances: wallDistances(item, app.data.room),
    collision: app.collisions.get(g) ?? { others: [], walls: [] },
  });
  measure.show(item, app.data.room);
}

function refresh() {
  app.collisions = checkCollisions(app.furniture, app.data.room);
  const warnings = [];
  for (const [g, c] of app.collisions) {
    const parts = [
      ...c.others.map((n) => `überschneidet „${n}“`),
      ...c.walls.map((w) => (w === 'ceiling' ? 'durch die Decke' : `durch die ${WALL_LABELS[w]}wand`)),
    ];
    if (parts.length) warnings.push({ group: g, name: g.userData.item.name, text: parts.join(', ') });
  }
  ui.setWarnings(warnings, (g) => select(g));
  refreshSelection();
}

function applyTime(hour) {
  const { azimuth, elevation } = sunFromTime(hour);
  app.lighting?.setSun(azimuth, elevation);
  if (app.data) app.data.light = { ...(app.data.light ?? {}), sunAzimuth: azimuth, sunElevation: Math.round(elevation * 10) / 10 };
}

// --- Laden / Aufbauen ---
function clearScene() {
  select(null);
  for (const g of app.furniture) {
    scene.remove(g);
    disposeObject(g);
  }
  app.furniture = [];
  if (app.roomObj) {
    scene.remove(app.roomObj.group);
    disposeObject(app.roomObj.group);
  }
  app.lighting?.dispose();
}

function setLayout(data, key, { keepView = false } = {}) {
  const roomChanged = !app.data
    || JSON.stringify(app.data.room) !== JSON.stringify(data.room)
    || JSON.stringify(app.data.openings) !== JSON.stringify(data.openings);
  clearScene();
  app.data = data;
  app.key = key;
  if (!keepView || !app.original) app.original = structuredClone(data);

  app.roomObj = buildRoom(data, renderer);
  scene.add(app.roomObj.group);
  app.lighting = createLighting(scene, data, app.roomObj);

  for (const item of data.furniture) {
    const g = createFurniture(item);
    scene.add(g);
    app.furniture.push(g);
  }

  setCeilingVisible(app.roomObj, ui.ceilingChecked || controls.state.mode === 'walk');
  setLabelsVisible(app.furniture, ui.labelsChecked);
  if (data.light?.sunAzimuth != null) {
    // Sonnenstand aus der Datei übernehmen
    app.lighting.setSun(data.light.sunAzimuth, data.light.sunElevation ?? 35);
    ui.setTime(6 + (data.light.sunAzimuth - 90) / 15);
  } else {
    applyTime(ui.time);
  }
  if (controls.state.mode === 'walk') controls.setMode('orbit');
  if (roomChanged && !keepView) controls.viewOverview();
  refresh();
}

async function openRoom(key) {
  try {
    const data = uploads.has(key) ? structuredClone(uploads.get(key)) : await loadRoom(key);
    setLayout(data, key);
    ui.setCurrentRoom(key);
    if (uploads.has(key)) return;
    const url = new URL(window.location.href);
    url.searchParams.set('room', key);
    window.history.replaceState(null, '', url);
  } catch (e) {
    console.error(e);
    ui.toast(e.message, true);
  }
}

// --- Größe & Renderloop ---
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);
  controls.update(dt);
  if (app.roomObj) {
    const autoHide = ui.autoHideWalls && controls.state.mode === 'orbit';
    updateWallVisibility(app.roomObj, app.data.room, camera.position, autoHide);
  }
  renderer.render(scene, camera);
});

// --- Start ---
const rooms = listRooms();
ui.setRooms(rooms);
const wanted = new URLSearchParams(window.location.search).get('room');
const startKey = rooms.find((r) => r.key === wanted)?.key ?? rooms.find((r) => r.key === 'wohnzimmer')?.key ?? rooms[0]?.key;
if (startKey) openRoom(startKey);
else ui.toast('Keine Raumdatei in rooms/ gefunden.', true);

// Für Tests/Debugging in der Browser-Konsole
window.raumplaner = { app, controls, scene, camera, renderer };

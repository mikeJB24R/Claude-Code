// Möbel: maßhaltige Quader (oder GLB-Modelle) mit Beschriftung, Platzierung und Kollisionsprüfung.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createTextSprite } from './textures.js';

const DEG = Math.PI / 180;
const EPS = 0.05; // cm – bündiges Anstoßen gilt nicht als Kollision
const gltfLoader = new GLTFLoader();

const COLOR_EDGE = 0x2b3138;
const COLOR_SELECTED = 0x1e88e5;
const COLOR_WARN = 0xe53935;

/** Erzeugt das 3D-Objekt für einen Möbel-Eintrag. Die Daten bleiben in group.userData.item. */
export function createFurniture(item) {
  item.rotation = item.rotation ?? 0;
  item.elevation = item.elevation ?? 0;
  item.position = item.position ?? { x: 50, z: 50 };

  const { width: w, depth: d, height: h } = item;
  const group = new THREE.Group();
  group.name = `furniture-${item.id ?? item.name}`;
  group.userData.item = item;

  const geo = new THREE.BoxGeometry(w, h, d);
  const material = new THREE.MeshStandardMaterial({ color: item.color ?? '#9e9e9e', roughness: 0.7, metalness: 0.02 });
  const body = new THREE.Mesh(geo, material);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.furniture = group;
  group.add(body);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: COLOR_EDGE, transparent: true, opacity: 0.6 })
  );
  edges.position.y = h / 2;
  group.add(edges);

  // Rote Warnhülle bei Kollision
  const warn = new THREE.Mesh(
    new THREE.BoxGeometry(w + 1.5, h + 1.5, d + 1.5),
    new THREE.MeshBasicMaterial({ color: COLOR_WARN, transparent: true, opacity: 0.35, depthWrite: false })
  );
  warn.position.y = h / 2;
  warn.visible = false;
  warn.raycast = () => {};
  group.add(warn);

  // Markierung der Vorderseite (+z lokal) als dünner Streifen am Boden
  const front = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.6, 0.6, 3),
    new THREE.MeshBasicMaterial({ color: 0x1e88e5, transparent: true, opacity: 0.7 })
  );
  front.position.set(0, 0.4, d / 2 + 3);
  front.raycast = () => {};
  group.add(front);

  const label = createTextSprite([item.name ?? 'Möbel', `${w} × ${d} × ${h} cm`], 22);
  label.position.y = h + 20;
  label.raycast = () => {};
  group.add(label);

  group.userData.parts = { body, edges, warn, label, front };
  updateTransform(group);

  if (item.model) loadModel(group, item.model);
  return group;
}

/** Lädt ein GLB-Modell und skaliert es exakt auf Breite × Tiefe × Höhe des Eintrags. */
function loadModel(group, url) {
  const { item, parts } = group.userData;
  gltfLoader.load(
    url,
    (gltf) => {
      const model = gltf.scene;
      model.rotation.y = (item.modelRotation ?? 0) * DEG;
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      if (size.x === 0 || size.y === 0 || size.z === 0) {
        console.warn(`Modell "${url}" hat keine Ausdehnung – Quader bleibt.`);
        return;
      }
      const wrapper = new THREE.Group();
      wrapper.add(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
      wrapper.scale.set(item.width / size.x, item.height / size.y, item.depth / size.z);
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.userData.furniture = group;
        }
      });
      group.add(wrapper);
      // Quader bleibt als unsichtbare Trefferfläche für Maus und Kollision
      parts.body.material.colorWrite = false;
      parts.body.material.depthWrite = false;
      parts.body.castShadow = false;
      parts.edges.material.opacity = 0.25;
      parts.model = wrapper;
    },
    undefined,
    (err) => console.warn(`Modell "${url}" konnte nicht geladen werden – Quader wird angezeigt.`, err?.message ?? err)
  );
}

/** Überträgt Position/Rotation aus den Daten auf das 3D-Objekt. */
export function updateTransform(group) {
  const { item } = group.userData;
  group.position.set(item.position.x, item.elevation ?? 0, item.position.z);
  group.rotation.y = (item.rotation ?? 0) * DEG;
}

/** Halbe Ausdehnung des achsparallelen Grundriss-Rechtecks (nach Rotation). */
export function halfExtents(item) {
  const a = (item.rotation ?? 0) * DEG;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return {
    hx: (c * item.width + s * item.depth) / 2,
    hz: (s * item.width + c * item.depth) / 2,
  };
}

/** Achsparalleles Grundriss-Rechteck { minX, maxX, minZ, maxZ }. */
export function footprintAABB(item) {
  const { hx, hz } = halfExtents(item);
  const { x, z } = item.position;
  return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz };
}

/** Eckpunkte des (gedrehten) Grundrisses in Weltkoordinaten. */
export function footprintCorners(item) {
  const a = (item.rotation ?? 0) * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const hw = item.width / 2;
  const hd = item.depth / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => ({
    x: item.position.x + lx * c + lz * s,
    z: item.position.z - lx * s + lz * c,
  }));
}

// Trennachsensatz (SAT) für zwei konvexe Vierecke
function polygonsOverlap(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const nx = p2.z - p1.z;
      const nz = p1.x - p2.x;
      const len = Math.hypot(nx, nz) || 1;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const p of a) { const v = (p.x * nx + p.z * nz) / len; minA = Math.min(minA, v); maxA = Math.max(maxA, v); }
      for (const p of b) { const v = (p.x * nx + p.z * nz) / len; minB = Math.min(minB, v); maxB = Math.max(maxB, v); }
      if (maxA <= minB + EPS || maxB <= minA + EPS) return false;
    }
  }
  return true;
}

/**
 * Prüft alle Möbel auf Überschneidungen untereinander und mit den Wänden.
 * Ergebnis: Map(group -> { others: [Namen], walls: [Wände] })
 */
export function checkCollisions(groups, room) {
  const result = new Map();
  const data = groups.map((g) => {
    const item = g.userData.item;
    return {
      g,
      item,
      corners: footprintCorners(item),
      y0: item.elevation ?? 0,
      y1: (item.elevation ?? 0) + item.height,
    };
  });
  for (const d of data) {
    const walls = [];
    for (const p of d.corners) {
      if (p.x < -EPS && !walls.includes('west')) walls.push('west');
      if (p.x > room.length + EPS && !walls.includes('east')) walls.push('east');
      if (p.z < -EPS && !walls.includes('north')) walls.push('north');
      if (p.z > room.width + EPS && !walls.includes('south')) walls.push('south');
    }
    if (d.y1 > room.height + EPS && !walls.includes('ceiling')) walls.push('ceiling');
    result.set(d.g, { others: [], walls });
  }
  for (let i = 0; i < data.length; i++) {
    for (let j = i + 1; j < data.length; j++) {
      const a = data[i];
      const b = data[j];
      const verticalOverlap = a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS;
      if (verticalOverlap && polygonsOverlap(a.corners, b.corners)) {
        result.get(a.g).others.push(b.item.name);
        result.get(b.g).others.push(a.item.name);
      }
    }
  }
  for (const [g, r] of result) setWarning(g, r.others.length > 0 || r.walls.length > 0);
  return result;
}

function setWarning(group, on) {
  const { parts } = group.userData;
  group.userData.colliding = on;
  parts.warn.visible = on;
  refreshEdgeColor(group);
}

export function setSelected(group, on) {
  group.userData.selected = on;
  refreshEdgeColor(group);
}

function refreshEdgeColor(group) {
  const { parts, selected, colliding } = group.userData;
  const color = colliding ? COLOR_WARN : selected ? COLOR_SELECTED : COLOR_EDGE;
  parts.edges.material.color.setHex(color);
  parts.edges.material.opacity = selected || colliding ? 1 : (parts.model ? 0.25 : 0.6);
  parts.body.material.emissive?.setHex(selected ? 0x0d2a45 : 0x000000);
}

export function setLabelsVisible(groups, visible) {
  for (const g of groups) g.userData.parts.label.visible = visible;
}

/** Gibt GPU-Ressourcen frei. */
export function disposeObject(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      m.map?.dispose();
      m.dispose();
    }
  });
}

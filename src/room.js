// Raum: Boden, Wände mit echten Ausschnitten für Fenster/Türen, Decke.
// Koordinaten (1 Einheit = 1 cm):
//   x: von der Westwand (x = 0) zur Ostwand (x = length)
//   z: von der Nordwand (z = 0) zur Südwand (z = width)
//   y: nach oben, Boden bei y = 0
import * as THREE from 'three';
import { createFloorTexture, createTextSprite } from './textures.js';

export const WALLS = ['north', 'east', 'south', 'west'];
export const WALL_LABELS = { north: 'Nord', east: 'Ost', south: 'Süd', west: 'West' };
// Ebene, auf der ausgeblendete Wände liegen: unsichtbar für die Kamera, wirft aber weiter Schatten
export const HIDDEN_LAYER = 1;

/** Länge der Wand (Innenmaß). */
export function wallLength(wall, room) {
  return wall === 'north' || wall === 'south' ? room.length : room.width;
}

/**
 * Rechnet eine Öffnung aus dem JSON in Wandkoordinaten um.
 * position = Abstand von der linken Ecke, wenn man im Raum steht und auf die Wand schaut
 * (oder "center"). Ergebnis: u0/u1 entlang der Weltachse der Wand (x für Nord/Süd, z für Ost/West).
 */
export function resolveOpening(opening, room) {
  const len = wallLength(opening.wall, room);
  const width = Math.min(opening.width, len);
  let left = opening.position === 'center' || opening.position == null
    ? (len - width) / 2
    : Number(opening.position);
  if (left < 0 || left + width > len) {
    console.warn(`Öffnung (${opening.type}, ${opening.wall}) ragt über die Wand hinaus – wird eingepasst.`);
    left = Math.min(Math.max(0, left), len - width);
  }
  const u0 = opening.wall === 'north' || opening.wall === 'east' ? left : len - left - width;
  const sill = opening.type === 'door' ? (opening.sill ?? 0) : (opening.sill ?? 90);
  const top = Math.min(sill + opening.height, room.height - 1);
  return { ...opening, wall: opening.wall, u0, u1: u0 + width, v0: sill, v1: top };
}

/** Umriss einer Wand inkl. Ausschnitten als THREE.Shape (u = entlang der Wand, v = Höhe). */
function wallShape(uStart, uEnd, height, openings) {
  const shape = new THREE.Shape();
  // Öffnungen, die bis zum Boden reichen (Türen), werden als Kerbe in den Umriss geschnitten,
  // alle anderen als Löcher – Löcher dürfen den Rand nicht berühren.
  const notches = openings.filter((o) => o.v0 <= 0.5).sort((a, b) => a.u0 - b.u0);
  const holes = openings.filter((o) => o.v0 > 0.5);

  shape.moveTo(uStart, 0);
  for (const n of notches) {
    shape.lineTo(n.u0, 0);
    shape.lineTo(n.u0, n.v1);
    shape.lineTo(n.u1, n.v1);
    shape.lineTo(n.u1, 0);
  }
  shape.lineTo(uEnd, 0);
  shape.lineTo(uEnd, height);
  shape.lineTo(uStart, height);
  shape.lineTo(uStart, 0);

  for (const h of holes) {
    const path = new THREE.Path();
    path.moveTo(h.u0, h.v0);
    path.lineTo(h.u0, h.v1);
    path.lineTo(h.u1, h.v1);
    path.lineTo(h.u1, h.v0);
    path.lineTo(h.u0, h.v0);
    shape.holes.push(path);
  }
  return shape;
}

/** Setzt ein Objekt, das in lokalen Wandkoordinaten (u, v, w = Tiefe 0..t von innen nach außen) gebaut ist. */
function placeOnWall(object, wall, room, t) {
  const { length: L, width: W } = room;
  switch (wall) {
    case 'north': object.position.set(0, 0, -t); break;          // w: z von -t .. 0
    case 'south': object.position.set(0, 0, W); break;           // w: z von W .. W+t
    case 'west': object.rotation.y = -Math.PI / 2; object.position.set(0, 0, 0); break;      // x von -t .. 0
    case 'east': object.rotation.y = -Math.PI / 2; object.position.set(L + t, 0, 0); break;  // x von L .. L+t
  }
}

function buildFrame(o, t, material) {
  // Rahmen (Zarge) aus vier bzw. drei schmalen Leisten in der Wandlaibung
  const group = new THREE.Group();
  const f = 5;
  const depth = o.type === 'window' ? 7 : t + 1;
  const wMid = t / 2 - depth / 2;
  const add = (w, h, cx, cy) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), material);
    m.position.set(cx, cy, wMid + depth / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  };
  const width = o.u1 - o.u0;
  const height = o.v1 - o.v0;
  add(f, height, o.u0 + f / 2, o.v0 + height / 2);
  add(f, height, o.u1 - f / 2, o.v0 + height / 2);
  add(width, f, o.u0 + width / 2, o.v1 - f / 2);
  if (o.type === 'window') add(width, f, o.u0 + width / 2, o.v0 + f / 2);

  if (o.type === 'window') {
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 2 * f, height - 2 * f),
      new THREE.MeshPhysicalMaterial({ color: 0xdfefff, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, depthWrite: false })
    );
    glass.position.set(o.u0 + width / 2, o.v0 + height / 2, wMid + depth / 2);
    glass.castShadow = false;
    glass.userData.isGlass = true;
    group.add(glass);
    // Fensterbank innen
    // Fensterbank: steht innen und außen je 6 cm über
    const sill = new THREE.Mesh(new THREE.BoxGeometry(width + 10, 2, t + 12), material);
    sill.position.set(o.u0 + width / 2, o.v0 - 1, t / 2);
    sill.castShadow = true;
    sill.receiveShadow = true;
    group.add(sill);
  }
  return group;
}

/**
 * Baut den kompletten Raum aus den JSON-Daten.
 * Rückgabe: { group, walls: {north, …}, ceiling, floor, openings }
 */
export function buildRoom(data, renderer) {
  const room = data.room;
  const { length: L, width: W, height: H } = room;
  const t = room.wallThickness ?? 12;
  const group = new THREE.Group();
  group.name = 'room';

  // Boden (als Platte, damit er Schatten sauber empfängt)
  const floorTex = createFloorTexture(room.floor ?? {}, L + 2 * t, W + 2 * t, renderer);
  const floorMat = new THREE.MeshStandardMaterial({
    color: floorTex ? 0xffffff : (room.floor?.color ?? '#cccccc'),
    map: floorTex,
    roughness: 0.75,
  });
  const floorGeo = new THREE.BoxGeometry(L + 2 * t, 10, W + 2 * t);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(L / 2, -5, W / 2);
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);

  // Wände
  const wallMat = new THREE.MeshStandardMaterial({ color: room.wallColor ?? '#f4f3ef', roughness: 0.92 });
  const frameMat = new THREE.MeshStandardMaterial({ color: room.frameColor ?? '#ffffff', roughness: 0.5 });
  const openings = (data.openings ?? []).map((o) => resolveOpening(o, room));
  const walls = {};
  for (const wall of WALLS) {
    const own = openings.filter((o) => o.wall === wall);
    const isNS = wall === 'north' || wall === 'south';
    // Nord-/Südwand laufen über die Ecken, damit die Ecken geschlossen sind
    const shape = isNS ? wallShape(-t, L + t, H, own) : wallShape(0, W, H, own);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `wall-${wall}`;
    const holder = new THREE.Group();
    holder.add(mesh);
    for (const o of own) holder.add(buildFrame(o, t, frameMat));
    placeOnWall(holder, wall, room, t);
    holder.name = `wall-${wall}`;
    holder.userData.wall = wall;
    walls[wall] = holder;
    group.add(holder);
  }

  // Decke
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(L + 2 * t, 10, W + 2 * t),
    new THREE.MeshStandardMaterial({ color: room.ceilingColor ?? '#ffffff', roughness: 0.95 })
  );
  ceiling.position.set(L / 2, H + 5, W / 2);
  ceiling.castShadow = true;
  ceiling.receiveShadow = true;
  ceiling.name = 'ceiling';
  group.add(ceiling);

  // Umgebung: Gelände unter dem Raum und Himmelsrichtungen
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ color: '#b9c2b0', roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(L / 2, -10.5, W / 2);
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  const compass = new THREE.Group();
  const labelPos = {
    north: [L / 2, -t - 45], south: [L / 2, W + t + 45],
    west: [-t - 45, W / 2], east: [L + t + 45, W / 2],
  };
  for (const wall of WALLS) {
    const s = createTextSprite(WALL_LABELS[wall], 22, { background: 'rgba(255,255,255,0.7)' });
    s.position.set(labelPos[wall][0], 12, labelPos[wall][1]);
    compass.add(s);
  }
  compass.name = 'compass';
  group.add(compass);

  return { group, walls, ceiling, floor, openings, thickness: t };
}

/** Wände auf der Kameraseite ausblenden (nur Ansicht, Schatten bleiben erhalten). */
export function updateWallVisibility(roomObj, room, cameraPos, autoHide) {
  const { length: L, width: W } = room;
  const outside = {
    north: cameraPos.z < 0,
    south: cameraPos.z > W,
    west: cameraPos.x < 0,
    east: cameraPos.x > L,
  };
  for (const wall of WALLS) {
    const hide = autoHide && outside[wall];
    roomObj.walls[wall].traverse((obj) => {
      if (hide) obj.layers.set(HIDDEN_LAYER);
      else obj.layers.set(0);
    });
  }
}

/** Decke ein-/ausblenden (Schatten der Decke bleiben erhalten, damit das Licht realistisch bleibt). */
export function setCeilingVisible(roomObj, visible) {
  roomObj.ceiling.layers.set(visible ? 0 : HIDDEN_LAYER);
}

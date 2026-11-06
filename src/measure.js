// Maßanzeige: Abstände eines Möbels zu den Wänden berechnen und als Maßlinien im Raum zeigen.
import * as THREE from 'three';
import { footprintAABB, disposeObject } from './furniture.js';
import { createTextSprite } from './textures.js';

/** Abstände (cm) der Außenkanten zu allen vier Wänden; negativ = ragt durch die Wand. */
export function wallDistances(item, room) {
  const b = footprintAABB(item);
  return {
    west: b.minX,
    east: room.length - b.maxX,
    north: b.minZ,
    south: room.width - b.maxZ,
  };
}

export function formatCm(v) {
  const r = Math.round(v * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)} cm`;
}

export function createMeasureOverlay(scene) {
  const group = new THREE.Group();
  group.name = 'measure';
  scene.add(group);

  function clear() {
    for (const c of [...group.children]) {
      group.remove(c);
      disposeObject(c);
    }
  }

  function line(a, b, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false }));
    l.renderOrder = 20;
    return l;
  }

  function dimension(a, b, text, color) {
    const g = new THREE.Group();
    if (a.distanceTo(b) < 0.5) return g; // bündig an der Wand: keine Linie
    g.add(line(a, b, color));
    // Endstriche
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(6);
    for (const p of [a, b]) g.add(line(p.clone().add(perp), p.clone().sub(perp), color));
    const label = createTextSprite(text, 16, { depthTest: false, font: 'bold 40px system-ui, sans-serif' });
    label.position.copy(a).add(b).multiplyScalar(0.5);
    label.position.y += 12;
    label.renderOrder = 21;
    g.add(label);
    return g;
  }

  /** Zeigt die Maßlinien zur nächstgelegenen Wand in x- und in z-Richtung. */
  function show(item, room) {
    clear();
    if (!item) return;
    const b = footprintAABB(item);
    const d = wallDistances(item, room);
    const y = (item.elevation ?? 0) + 2;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const color = 0x1565c0;
    const warn = 0xe53935;

    const xSide = d.west <= d.east ? 'west' : 'east';
    const zSide = d.north <= d.south ? 'north' : 'south';
    if (xSide === 'west') {
      group.add(dimension(new THREE.Vector3(0, y, cz), new THREE.Vector3(b.minX, y, cz), formatCm(d.west), d.west < 0 ? warn : color));
    } else {
      group.add(dimension(new THREE.Vector3(b.maxX, y, cz), new THREE.Vector3(room.length, y, cz), formatCm(d.east), d.east < 0 ? warn : color));
    }
    if (zSide === 'north') {
      group.add(dimension(new THREE.Vector3(cx, y, 0), new THREE.Vector3(cx, y, b.minZ), formatCm(d.north), d.north < 0 ? warn : color));
    } else {
      group.add(dimension(new THREE.Vector3(cx, y, b.maxZ), new THREE.Vector3(cx, y, room.width), formatCm(d.south), d.south < 0 ? warn : color));
    }
  }

  return { group, show, clear };
}

// Steuerung: Kameramodi (Orbit / Begehen) und Verschieben/Drehen von Möbeln mit der Maus.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { halfExtents } from './furniture.js';

const EYE_HEIGHT = 160;   // cm
const WALK_SPEED = 140;   // cm/s, mit Shift doppelt
const WALL_MARGIN = 25;   // cm Abstand, den die Kamera beim Begehen zu den Wänden hält

export function createControls({ camera, dom, getRoom, getFurniture, callbacks }) {
  const state = {
    mode: 'orbit',
    snap: true,
    grid: 5,
    selected: null,
    drag: null,
    keys: new Set(),
  };

  // --- Auswahl & Verschieben (muss vor OrbitControls auf pointerdown reagieren) ---
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  function setPointer(ev) {
    const r = dom.getBoundingClientRect();
    pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  }

  function pickFurniture(ndc) {
    raycaster.setFromCamera(ndc, camera);
    const bodies = getFurniture().map((g) => g.userData.parts.body);
    const hits = raycaster.intersectObjects(bodies, false);
    return hits.length ? hits[0].object.userData.furniture : null;
  }

  function snapValue(v) {
    return state.snap ? Math.round(v / state.grid) * state.grid : Math.round(v * 10) / 10;
  }

  /** Setzt die Mitte so, dass die Außenkante (Grundriss-Ecke) auf dem Raster liegt. */
  function moveTo(group, cx, cz) {
    const item = group.userData.item;
    const { hx, hz } = halfExtents(item);
    item.position.x = snapValue(cx - hx) + hx;
    item.position.z = snapValue(cz - hz) + hz;
    callbacks.onMoved(group);
  }

  function onPointerDown(ev) {
    if (state.mode !== 'orbit' || ev.button !== 0) return;
    setPointer(ev);
    const g = pickFurniture(pointer);
    state.downAt = { x: ev.clientX, y: ev.clientY, hitFurniture: !!g };
    if (!g) return;
    orbit.enabled = false;               // Kamera bleibt beim Ziehen stehen
    raycaster.setFromCamera(pointer, camera);
    const elev = g.userData.item.elevation ?? 0;
    floorPlane.constant = -elev;
    if (!raycaster.ray.intersectPlane(floorPlane, hit)) return;
    state.drag = {
      group: g,
      offsetX: g.userData.item.position.x - hit.x,
      offsetZ: g.userData.item.position.z - hit.z,
      moved: false,
    };
    callbacks.onSelect(g);
    dom.setPointerCapture?.(ev.pointerId);
  }

  function onPointerMove(ev) {
    if (!state.drag) {
      if (state.mode === 'orbit') {
        setPointer(ev);
        dom.style.cursor = pickFurniture(pointer) ? 'grab' : 'default';
      }
      return;
    }
    setPointer(ev);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(floorPlane, hit)) return;
    state.drag.moved = true;
    dom.style.cursor = 'grabbing';
    moveTo(state.drag.group, hit.x + state.drag.offsetX, hit.z + state.drag.offsetZ);
  }

  function onPointerUp(ev) {
    if (state.drag) {
      if (state.drag.moved) callbacks.onDragEnd(state.drag.group);
      state.drag = null;
      dom.style.cursor = 'grab';
    } else if (state.mode === 'orbit' && state.downAt && !state.downAt.hitFurniture) {
      // Klick ins Leere (ohne Kamerabewegung) hebt die Auswahl auf
      const moved = Math.hypot(ev.clientX - state.downAt.x, ev.clientY - state.downAt.y);
      if (moved < 4) callbacks.onSelect(null);
    }
    state.downAt = null;
    orbit.enabled = state.mode === 'orbit';
  }

  dom.parentElement.addEventListener('pointerdown', onPointerDown, { capture: true });
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  // --- Orbit ---
  const orbit = new OrbitControls(camera, dom);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = Math.PI / 2 - 0.02;
  orbit.minDistance = 50;
  orbit.maxDistance = 8000;
  orbit.screenSpacePanning = true;

  // Brennweite je Ansicht: Draufsicht mit engem Blickwinkel wirkt fast wie ein Grundriss
  function setFov(fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  function viewOverview() {
    setFov(50);
    const { length: L, width: W, height: H } = getRoom();
    orbit.target.set(L / 2, 0, W / 2);
    const d = Math.max(L, W) * 1.25;
    camera.position.set(L / 2 + d * 0.45, H + d * 0.9, W / 2 + d * 0.95);
    orbit.update();
  }

  function viewTop() {
    const { length: L, width: W, height: H } = getRoom();
    orbit.target.set(L / 2, 0, W / 2);
    setFov(15);
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    // Abstand, bei dem der Raum (plus Rand für die Seitenleiste) ganz ins Bild passt
    const dist = Math.max((W / 2) / tanHalf, (L / 2) / (tanHalf * camera.aspect)) * 1.35;
    camera.position.set(L / 2, dist + H, W / 2 + 0.01);
    orbit.update();
  }

  // --- Begehen (Ego-Perspektive) ---
  const walk = new PointerLockControls(camera, document.body);
  const savedOrbit = { pos: new THREE.Vector3(), target: new THREE.Vector3() };

  // requestPointerLock kann abgelehnt werden (z. B. ohne Nutzergeste) – dann einfach per Klick erneut
  function lockPointer() {
    try {
      const p = document.body.requestPointerLock();
      p?.catch?.(() => callbacks.onWalkLock(false));
    } catch {
      callbacks.onWalkLock(false);
    }
  }

  walk.addEventListener('lock', () => callbacks.onWalkLock(true));
  walk.addEventListener('unlock', () => callbacks.onWalkLock(false));

  function setMode(mode) {
    if (mode === state.mode) return;
    if (mode === 'walk') {
      savedOrbit.pos.copy(camera.position);
      savedOrbit.target.copy(orbit.target);
      savedOrbit.fov = camera.fov;
      setFov(70);
      orbit.enabled = false;
      const { length: L, width: W } = getRoom();
      camera.position.set(L / 2, EYE_HEIGHT, W - 60);
      camera.up.set(0, 1, 0);
      camera.lookAt(L / 2, EYE_HEIGHT, 0);
      state.mode = 'walk';
      lockPointer();
    } else {
      walk.unlock();
      state.mode = 'orbit';
      camera.position.copy(savedOrbit.pos);
      setFov(savedOrbit.fov ?? 50);
      orbit.target.copy(savedOrbit.target);
      orbit.enabled = true;
      orbit.update();
    }
    callbacks.onModeChange(state.mode);
  }

  // Im Begehen-Modus: Klick sperrt die Maus bzw. wählt das Möbel im Fadenkreuz
  dom.addEventListener('click', () => {
    if (state.mode !== 'walk') return;
    if (!walk.isLocked) { lockPointer(); return; }
    callbacks.onSelect(pickFurniture(new THREE.Vector2(0, 0)));
  });

  // --- Tastatur ---
  function onKeyDown(ev) {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
    state.keys.add(ev.code);
    if (ev.code === 'KeyR' && state.selected) {
      const item = state.selected.userData.item;
      item.rotation = (((item.rotation ?? 0) + (ev.shiftKey ? -90 : 90)) % 360 + 360) % 360;
      // Nach dem Drehen die Außenkante wieder aufs Raster legen
      moveTo(state.selected, item.position.x, item.position.z);
      callbacks.onDragEnd(state.selected);
    }
    if (ev.code === 'KeyC') setMode(state.mode === 'orbit' ? 'walk' : 'orbit');
    if (ev.code === 'Escape' && state.selected && state.mode === 'orbit') callbacks.onSelect(null);
  }
  function onKeyUp(ev) { state.keys.delete(ev.code); }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => state.keys.clear());

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  function update(dt) {
    if (state.mode === 'orbit') {
      orbit.update();
      return;
    }
    const k = state.keys;
    const speed = WALK_SPEED * (k.has('ShiftLeft') || k.has('ShiftRight') ? 2 : 1) * dt;
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();
    const move = new THREE.Vector3();
    if (k.has('KeyW') || k.has('ArrowUp')) move.add(forward);
    if (k.has('KeyS') || k.has('ArrowDown')) move.sub(forward);
    if (k.has('KeyD') || k.has('ArrowRight')) move.add(right);
    if (k.has('KeyA') || k.has('ArrowLeft')) move.sub(right);
    if (move.lengthSq() > 0) camera.position.addScaledVector(move.normalize(), speed);
    const { length: L, width: W } = getRoom();
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, WALL_MARGIN, L - WALL_MARGIN);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, WALL_MARGIN, W - WALL_MARGIN);
    camera.position.y = EYE_HEIGHT;
  }

  return {
    state,
    orbit,
    update,
    setMode,
    viewOverview,
    viewTop,
    setSnap(on) { state.snap = on; },
    setSelected(g) { state.selected = g; },
    moveTo,
  };
}

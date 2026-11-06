// Beleuchtung: Sonne mit weichen Schatten, Himmelslicht durch die Fenster, etwas Grundhelligkeit.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { HIDDEN_LAYER } from './room.js';

let uniformsReady = false;

/**
 * azimuth: Himmelsrichtung, aus der die Sonne scheint (0 = Nord, 90 = Ost, 180 = Süd, 270 = West)
 * elevation: Sonnenhöhe über dem Horizont in Grad
 */
export function sunDirection(azimuth, elevation) {
  const az = azimuth * Math.PI / 180;
  const el = elevation * Math.PI / 180;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

/** Sonnenstand aus Uhrzeit (grob, Mitteleuropa im Frühling/Herbst). */
export function sunFromTime(hour) {
  const azimuth = 90 + (hour - 6) * 15;         // 6 Uhr Ost, 12 Uhr Süd, 18 Uhr West
  const elevation = Math.max(3, 40 * Math.sin(((hour - 6) / 12) * Math.PI));
  return { azimuth, elevation };
}

export function createLighting(scene, data, roomObj) {
  if (!uniformsReady) {
    RectAreaLightUniformsLib.init();
    uniformsReady = true;
  }
  const { length: L, width: W, height: H } = data.room;
  const group = new THREE.Group();
  group.name = 'lighting';
  const center = new THREE.Vector3(L / 2, H / 2, W / 2);

  // Grundhelligkeit (indirektes Licht), bewusst schwach
  const hemi = new THREE.HemisphereLight(0xe3ecf7, 0xd6c8b2, 0.9);
  group.add(hemi);

  // Sonne
  const sun = new THREE.DirectionalLight(0xfff1dc, 4.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const extent = Math.max(L, W, H) * 1.3 + 200;
  const cam = sun.shadow.camera;
  cam.left = -extent; cam.right = extent; cam.top = extent; cam.bottom = -extent;
  cam.near = 10; cam.far = 6000;
  cam.layers.enable(0);
  cam.layers.enable(HIDDEN_LAYER); // ausgeblendete Wände/Decke werfen weiter Schatten
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 1.5;
  sun.shadow.radius = 6;
  sun.target.position.copy(center);
  group.add(sun, sun.target);

  // Himmelslicht durch jedes Fenster (weich, ohne Schatten)
  const windowLights = [];
  for (const o of roomObj.openings.filter((op) => op.type === 'window')) {
    const w = o.u1 - o.u0;
    const h = o.v1 - o.v0;
    const light = new THREE.RectAreaLight(0xe6f0ff, 3.5, w, h);
    const uMid = (o.u0 + o.u1) / 2;
    const vMid = (o.v0 + o.v1) / 2;
    const inset = 1;
    switch (o.wall) {
      case 'north': light.position.set(uMid, vMid, inset); light.lookAt(uMid, vMid, W); break;
      case 'south': light.position.set(uMid, vMid, W - inset); light.lookAt(uMid, vMid, 0); break;
      case 'west': light.position.set(inset, vMid, uMid); light.lookAt(L, vMid, uMid); break;
      case 'east': light.position.set(L - inset, vMid, uMid); light.lookAt(0, vMid, uMid); break;
    }
    windowLights.push(light);
    group.add(light);
  }

  scene.add(group);

  function setSun(azimuth, elevation) {
    const dir = sunDirection(azimuth, elevation);
    sun.position.copy(center).addScaledVector(dir, 2500);
    sun.target.position.copy(center);
    // Bei tiefer Sonne wird das Licht wärmer und schwächer
    const k = Math.min(1, elevation / 30);
    sun.intensity = 1.5 + 2.7 * k;
    sun.color.setRGB(1, 0.82 + 0.13 * k, 0.65 + 0.21 * k);
  }

  const light = data.light ?? {};
  setSun(light.sunAzimuth ?? 180, light.sunElevation ?? 35);

  return {
    group,
    setSun,
    dispose() {
      scene.remove(group);
      sun.shadow.map?.dispose();
    },
  };
}

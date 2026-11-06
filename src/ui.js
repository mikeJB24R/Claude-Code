// UI: Seitenleiste, Infofenster zum ausgewählten Möbel, Warnliste, Meldungen.
import { WALL_LABELS } from './room.js';
import { formatCm } from './measure.js';

const $ = (id) => document.getElementById(id);

export function createUI(handlers) {
  const el = {
    roomSelect: $('room-select'),
    save: $('btn-save'),
    file: $('file-input'),
    reset: $('btn-reset'),
    orbit: $('btn-orbit'),
    walk: $('btn-walk'),
    overview: $('btn-overview'),
    top: $('btn-top'),
    snap: $('chk-snap'),
    ceiling: $('chk-ceiling'),
    walls: $('chk-walls'),
    labels: $('chk-labels'),
    time: $('time'),
    timeValue: $('time-value'),
    warnings: $('warnings'),
    info: $('info'),
    infoName: $('info-name'),
    infoDims: $('info-dims'),
    infoDist: $('info-dist'),
    infoStatus: $('info-status'),
    infoClose: $('info-close'),
    inX: $('in-x'),
    inZ: $('in-z'),
    inRot: $('in-rot'),
    crosshair: $('crosshair'),
    walkHint: $('walk-hint'),
    toast: $('toast'),
  };

  el.roomSelect.addEventListener('change', () => handlers.onRoomChange(el.roomSelect.value));
  el.save.addEventListener('click', () => handlers.onSave());
  el.file.addEventListener('change', () => {
    const f = el.file.files?.[0];
    if (f) handlers.onUpload(f);
    el.file.value = '';
  });
  el.reset.addEventListener('click', () => handlers.onReset());
  el.orbit.addEventListener('click', () => handlers.onMode('orbit'));
  el.walk.addEventListener('click', () => handlers.onMode('walk'));
  el.overview.addEventListener('click', () => handlers.onView('overview'));
  el.top.addEventListener('click', () => handlers.onView('top'));
  el.snap.addEventListener('change', () => handlers.onSnap(el.snap.checked));
  el.ceiling.addEventListener('change', () => handlers.onCeiling(el.ceiling.checked));
  el.walls.addEventListener('change', () => handlers.onAutoHideWalls(el.walls.checked));
  el.labels.addEventListener('change', () => handlers.onLabels(el.labels.checked));
  el.time.addEventListener('input', () => {
    updateTimeLabel();
    handlers.onTime(Number(el.time.value));
  });
  el.infoClose.addEventListener('click', () => handlers.onDeselect());

  const commitEdit = () => handlers.onEditSelected({
    x: Number(el.inX.value),
    z: Number(el.inZ.value),
    rotation: Number(el.inRot.value),
  });
  for (const input of [el.inX, el.inZ, el.inRot]) input.addEventListener('change', commitEdit);

  function updateTimeLabel() {
    const h = Number(el.time.value);
    const mm = String(Math.round((h % 1) * 60)).padStart(2, '0');
    el.timeValue.textContent = `${Math.floor(h)}:${mm} Uhr`;
  }
  updateTimeLabel();

  let toastTimer;
  function toast(msg, isError = false) {
    el.toast.textContent = msg;
    el.toast.classList.toggle('error', isError);
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, isError ? 6000 : 2500);
  }

  return {
    toast,
    get ceilingChecked() { return el.ceiling.checked; },
    get autoHideWalls() { return el.walls.checked; },
    get labelsChecked() { return el.labels.checked; },
    get snapChecked() { return el.snap.checked; },
    get time() { return Number(el.time.value); },

    /** Schieberegler auf eine Uhrzeit setzen (ohne das Licht neu zu berechnen). */
    setTime(hour) {
      el.time.value = String(Math.min(20, Math.max(6, hour)));
      updateTimeLabel();
    },

    setRooms(rooms, current) {
      el.roomSelect.innerHTML = '';
      for (const r of rooms) {
        const opt = document.createElement('option');
        opt.value = r.key;
        opt.textContent = r.label;
        el.roomSelect.appendChild(opt);
      }
      if (current) this.setCurrentRoom(current);
    },

    setCurrentRoom(key, label) {
      let opt = [...el.roomSelect.options].find((o) => o.value === key);
      if (!opt) {
        // Hochgeladene Layouts erscheinen als eigener Eintrag
        opt = document.createElement('option');
        opt.value = key;
        opt.textContent = label ?? key;
        el.roomSelect.appendChild(opt);
      }
      el.roomSelect.value = key;
    },

    setMode(mode) {
      el.orbit.classList.toggle('active', mode === 'orbit');
      el.walk.classList.toggle('active', mode === 'walk');
      el.overview.disabled = el.top.disabled = mode !== 'orbit';
      el.crosshair.hidden = mode !== 'walk';
      el.walkHint.hidden = mode !== 'walk';
    },

    setWalkLocked(locked) {
      el.walkHint.textContent = locked
        ? 'WASD laufen · Shift schneller · Klick wählt Möbel · R dreht · Esc Maus freigeben'
        : 'Klicken, um sich umzusehen · C oder „Orbit“ für die Übersicht';
    },

    /** sel = { item, distances, collision } oder null */
    showSelection(sel) {
      if (!sel) { el.info.hidden = true; return; }
      const { item, distances, collision } = sel;
      el.info.hidden = false;
      el.infoName.textContent = item.name;
      el.infoDims.innerHTML = `
        <dt>Breite</dt><dd>${formatCm(item.width)}</dd>
        <dt>Tiefe</dt><dd>${formatCm(item.depth)}</dd>
        <dt>Höhe</dt><dd>${formatCm(item.height)}</dd>
        ${item.elevation ? `<dt>Über Boden</dt><dd>${formatCm(item.elevation)}</dd>` : ''}
        ${item.model ? `<dt>Modell</dt><dd>${item.model}</dd>` : ''}`;
      if (document.activeElement !== el.inX) el.inX.value = round1(item.position.x);
      if (document.activeElement !== el.inZ) el.inZ.value = round1(item.position.z);
      if (document.activeElement !== el.inRot) el.inRot.value = round1(item.rotation);

      const minX = Math.min(distances.west, distances.east);
      const minZ = Math.min(distances.north, distances.south);
      el.infoDist.innerHTML = ['north', 'east', 'south', 'west'].map((w) => {
        const v = distances[w];
        const isAxisX = w === 'west' || w === 'east';
        const nearest = v === (isAxisX ? minX : minZ);
        const cls = v < -0.05 ? 'neg' : nearest ? 'nearest' : '';
        return `<dt>${WALL_LABELS[w]}wand</dt><dd class="${cls}">${formatCm(v)}</dd>`;
      }).join('');

      const problems = [
        ...collision.others.map((n) => `überschneidet „${n}“`),
        ...collision.walls.map((w) => w === 'ceiling' ? 'ragt durch die Decke' : `ragt durch die ${WALL_LABELS[w]}wand`),
      ];
      el.infoStatus.className = problems.length ? 'warn' : 'ok';
      el.infoStatus.textContent = problems.length ? `⚠ ${problems.join(', ')}` : '✓ Passt';
    },

    /** list = [{ group, name, text }] */
    setWarnings(list, onPick) {
      el.warnings.innerHTML = '';
      if (!list.length) {
        el.warnings.innerHTML = '<li class="ok">Keine Kollisionen</li>';
        return;
      }
      for (const w of list) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.textContent = w.name;
        b.addEventListener('click', () => onPick(w.group));
        li.append('⚠ ', b, `: ${w.text}`);
        el.warnings.appendChild(li);
      }
    },
  };
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

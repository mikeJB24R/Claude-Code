# 3D-Raumplaner

Interaktiver 3D-Raumplaner im Browser (Vite + Three.js, Vanilla JS). Räume werden maßhaltig in Zentimetern aus JSON-Dateien aufgebaut; Möbel lassen sich verschieben, drehen und auf Kollisionen prüfen.

## Start

```bash
npm install
npm run dev
```

Dann <http://localhost:5173> öffnen. Ein bestimmter Raum lässt sich direkt über `?room=<dateiname>` öffnen, z. B. `http://localhost:5173/?room=arbeitszimmer`.

`npm run build` erzeugt eine statische Version in `dist/`.

## Bedienung

| Aktion | Steuerung |
| --- | --- |
| Kamera drehen / verschieben / zoomen (Orbit) | linke / rechte Maustaste ziehen, Mausrad |
| Möbel verschieben | Möbel anklicken und ziehen (Raster-Snap 5 cm, in der Seitenleiste abschaltbar) |
| Möbel drehen | `R` = +90°, `Shift`+`R` = −90° |
| Auswahl aufheben | `Esc` oder Klick ins Leere |
| Exakte Position | X/Z/Drehung im Infofenster rechts eintippen |
| Begehen (Ego-Perspektive, Augenhöhe 160 cm) | `C` oder Schalter „Begehen“, dann `W` `A` `S` `D` + Maus, `Shift` = schneller |
| Möbel im Begehen-Modus wählen | Fadenkreuz draufrichten und klicken |

Weitere Schalter: Draufsicht/Übersicht, Decke anzeigen, vordere Wände automatisch ausblenden, Beschriftungen, Tageszeit (Sonnenstand).

Möbel, die sich überschneiden oder durch Wand/Decke ragen, werden rot markiert und in der Seitenleiste unter „Warnungen“ aufgeführt. Beim Anklicken zeigt das Infofenster Maße, Position und die Abstände zu allen vier Wänden; die Maßlinien zur jeweils nächsten Wand erscheinen im Raum.

**Layout speichern** lädt das aktuelle Layout als JSON herunter, **Layout laden** liest eine solche Datei wieder ein. Hochgeladene Varianten bleiben in der Raumauswahl, so lassen sich mehrere Varianten nebeneinander vergleichen.

## Koordinaten

Alle Maße in **Zentimetern**. Blick von oben, Norden oben:

```
          Nord (z = 0)
     ┌──────────────────────┐
West │ (0,0)            x → │ Ost
(x=0)│ z                    │ (x = length)
     │ ↓                    │
     └──────────────────────┘
          Süd (z = width)
```

- `x` läuft von der Westwand zur Ostwand (`length`), `z` von der Nordwand zur Südwand (`width`).
- Maße sind **Innenmaße**; die Wandstärke liegt außen.

## JSON-Format (`rooms/<raumname>.json`)

Jede Datei im Ordner `rooms/` erscheint automatisch in der Raumauswahl.

```json
{
  "name": "Wohnzimmer",
  "room": {
    "length": 480,
    "width": 360,
    "height": 250,
    "wallThickness": 12,
    "floor": { "color": "#d9bc8c", "texture": "wood" },
    "wallColor": "#f4f3ef",
    "ceilingColor": "#ffffff"
  },
  "openings": [
    { "type": "window", "wall": "south", "position": "center", "width": 180, "height": 140, "sill": 90 },
    { "type": "door",   "wall": "north", "position": 40,       "width": 90,  "height": 210, "sill": 0 }
  ],
  "furniture": [
    {
      "id": "sofa",
      "name": "Sofa",
      "width": 220, "depth": 95, "height": 85,
      "color": "#5c6b7a",
      "position": { "x": 432.5, "z": 180 },
      "rotation": 270
    }
  ],
  "light": { "sunAzimuth": 180, "sunElevation": 35 }
}
```

### `room`

| Feld | Bedeutung |
| --- | --- |
| `length` | Länge in x-Richtung (West → Ost), Pflicht |
| `width` | Breite in z-Richtung (Nord → Süd), Pflicht |
| `height` | Deckenhöhe, Pflicht |
| `wallThickness` | Wandstärke (Standard 12) |
| `floor.color` | Grundfarbe des Bodens |
| `floor.texture` | `"wood"` (Dielen), `"tiles"` (Fliesen 60 × 60), `"plain"` oder Pfad zu einem Bild in `public/` |
| `floor.textureSize` | nur bei Bilddateien: Kantenlänge einer Bildkachel in cm (Standard 100) |
| `wallColor`, `ceilingColor`, `frameColor` | Farben für Wände, Decke, Fenster-/Türrahmen |

### `openings` (Fenster und Türen)

| Feld | Bedeutung |
| --- | --- |
| `type` | `"window"` oder `"door"` |
| `wall` | `"north"`, `"east"`, `"south"` oder `"west"` |
| `position` | Abstand der Öffnung von der **linken Ecke**, wenn man im Raum steht und auf diese Wand schaut – oder `"center"` |
| `width`, `height` | Breite und Höhe der Öffnung |
| `sill` | Brüstungshöhe (Unterkante über dem Boden). Standard: Fenster 90, Tür 0 |

### `furniture`

| Feld | Bedeutung |
| --- | --- |
| `id` | eindeutige Kennung (optional) |
| `name` | Beschriftung |
| `width`, `depth`, `height` | Breite (lokal x), Tiefe (lokal z), Höhe |
| `color` | Farbe des Quaders |
| `position.x`, `position.z` | **Mitte** der Grundfläche |
| `rotation` | Drehung in Grad gegen den Uhrzeigersinn (von oben gesehen). Bei `0` zeigt die Vorderseite nach Süden, `90` = Osten, `180` = Norden, `270` = Westen. Die Vorderseite ist im 3D-Bild durch einen blauen Streifen markiert. |
| `elevation` | Höhe der Unterkante über dem Boden, z. B. für Wandregale (Standard 0) |
| `model` | optional: Pfad zu einem GLB-Modell (relativ zu `public/`, z. B. `"models/sessel.glb"`). Das Modell wird exakt auf Breite × Tiefe × Höhe skaliert; die Vorderseite des Modells sollte in +z zeigen. Kann das Modell nicht geladen werden, bleibt der Quader. |
| `modelRotation` | optional: Korrektur, falls die Vorderseite des Modells nicht in +z zeigt (Grad) |

### `light` (optional)

`sunAzimuth`: Himmelsrichtung der Sonne in Grad (0 = Nord, 90 = Ost, 180 = Süd, 270 = West), `sunElevation`: Sonnenhöhe in Grad. Der Regler „Tageszeit“ überschreibt beides; gespeicherte Layouts enthalten den eingestellten Sonnenstand.

## Projektstruktur

```
rooms/              Raumdefinitionen (JSON)
public/models/      GLB-Modelle (Beispiel: sessel.glb)
src/main.js         Einstieg: Szene, Renderer, Zusammenspiel der Module
src/room.js         Raum: Boden, Wände mit Ausschnitten, Fenster-/Türrahmen, Decke
src/furniture.js    Möbel: Quader/GLB, Beschriftung, Grundriss-Geometrie, Kollisionsprüfung
src/controls.js     Steuerung: Orbit, Begehen, Verschieben/Drehen mit Raster-Snap
src/lighting.js     Licht: Sonne mit weichen Schatten, Himmelslicht durch die Fenster
src/measure.js      Maßanzeige: Wandabstände und Maßlinien
src/io.js           Laden aus rooms/, Layout-Download/-Upload, Validierung
src/ui.js           Seitenleiste, Infofenster, Warnungen
src/textures.js     Prozedurale Boden- und Beschriftungstexturen
```

## Hinweise

- Kollisionen werden mit dem gedrehten Grundriss (auch bei schrägen Winkeln) und der Höhe geprüft: Ein Wandregal in 150 cm Höhe kollidiert nicht mit einer Kommode darunter. Bündiges Anstoßen gilt nicht als Kollision.
- Beim Ziehen rastet die **Außenkante** des Möbels im 5-cm-Raster ein, nicht die Mitte – so lässt es sich exakt bündig an die Wand schieben.
- Ausgeblendete Wände und Decke werfen weiterhin Schatten, damit das Licht im Raum gleich bleibt.

# Tab Sortierer – Safari-Erweiterung

Sortiert deine Tabs nach Kategorien, die du selbst festlegst. Ist sich die Erweiterung
bei einem Tab nicht sicher, bleibt er in der Hauptgruppe. Bestimmte Gruppen lassen sich ausschließen.

## Wichtig: So arbeitet die Erweiterung in Safari

Safari gibt Erweiterungen keinen Zugriff auf seine Tabgruppen in der Seitenleiste.
Keine Erweiterung kann dort Tabgruppen anlegen oder befüllen.
Darum bekommt in Safari **jede Kategorie ein eigenes Fenster**:

- Das Fenster, in dem du sortierst, ist die **Hauptgruppe**. Unsichere Tabs bleiben dort.
- Für jede Kategorie, also z. B. „Arbeit“ oder „News“, entsteht ein eigenes Fenster.
  Beim nächsten Sortieren kommen weitere Tabs in dasselbe Fenster.
- Willst du daraus eine echte Safari-Tabgruppe machen: Wechsle in das Kategorie-Fenster und
  wähle **Ablage → Neue Tabgruppe mit X Tabs**.

In Chrome, Edge oder Firefox entstehen mit derselben Erweiterung echte Tabgruppen.
Sollte Apple später eine Tabgruppen-API einführen, nutzt die Erweiterung sie automatisch.

## Installation ohne Terminal

Entpacke zuerst die ZIP-Datei per Doppelklick im Finder. Du erhältst den Ordner `safari-tab-sorter`.

### Weg A – ohne Xcode, in 1 Minute (Safari 26 oder neuer)

1. Öffne **Safari → Einstellungen → Erweitert** und setze den Haken bei **„Funktionen für Webentwickler anzeigen“**.
2. In den Einstellungen erscheint jetzt der Reiter **„Entwickler“**. Öffne ihn und klicke auf **„Temporäre Erweiterung hinzufügen …“**.
3. Wähle den Ordner `safari-tab-sorter` aus.
4. Erlaube der Erweiterung den Zugriff auf Websites.
   Sonst kann sie die Titel und Adressen der Tabs nicht lesen.

Nachteil: Die Erweiterung ist **temporär**. Nach jedem Beenden von Safari musst du die Schritte 2 und 3 wiederholen.
Deine Kategorien gehen dabei unter Umständen verloren.

### Weg B – dauerhaft, mit Xcode (nur Mausklicks)

1. Installiere **Xcode** aus dem App Store und starte es.
2. Wähle **File → New → Project …**, dann oben **macOS** und dort **„Safari Extension App“**. Klicke auf **Next**.
   - Product Name: `Tab Sortierer`
   - Team: deine Apple-ID. Hast du noch keine hinterlegt, gehst du auf „Add Account …“. Eine kostenlose Apple-ID genügt.
   - Language: Swift. Type: **Safari Web Extension**.
   - Speichere das Projekt, z. B. in „Dokumente“.
3. Klappe links im Projekt-Navigator **„Tab Sortierer Extension“ → „Resources“** auf.
   Markiere alles darin und lösche es (Rechtsklick → Delete → „Move to Trash“).
4. Ziehe **den Inhalt** des Ordners `safari-tab-sorter` aus dem Finder auf „Resources“.
   Das sind `manifest.json`, die `.js`-, `.html`- und `.css`-Dateien und der Ordner `icons`.
   Im folgenden Fenster setzt du den Haken bei **„Copy items if needed“** und beim Ziel **„Tab Sortierer Extension“**.
5. Klicke oben links auf **▶ (Run)**. Eine kleine App öffnet sich. Du kannst sie schließen.
6. Öffne **Safari → Einstellungen → Erweiterungen**, schalte **„Tab Sortierer“** ein und erlaube den Zugriff auf Websites.

Erscheint die Erweiterung in Schritt 6 nicht, liegt das an der Signierung.
Aktiviere dann im Reiter „Entwickler“ der Safari-Einstellungen **„Nicht signierte Erweiterungen erlauben“**.
Danach siehst du sie in der Liste.

### Weg C – in Chrome (dauerhaft, echte Tabgruppen)

1. Gib in Chrome `chrome://extensions` in die Adressleiste ein.
2. Schalte oben rechts den **Entwicklermodus** ein.
3. Klicke auf **„Entpackte Erweiterung laden“** und wähle den Ordner `safari-tab-sorter`.
4. Hefte die Erweiterung über das Puzzle-Symbol in der Symbolleiste an.

### Tabs von Safari nach Chrome holen

1. Markiere in Safari die Tabs (⌘-Klick) oder klicke eine Tabgruppe in der Seitenleiste mit rechts an.
   Wähle **„Links kopieren“**.
2. Klicke in Chrome auf das Symbol der Erweiterung und dann auf **„Links einfügen (z. B. aus Safari)“**.
3. Füge die Links mit **⌘V** ein und klicke auf **„Öffnen & sortieren“**.

Die Erweiterung öffnet alle Links im Hintergrund und wartet, bis sie geladen sind.
Dann sortiert sie die Tabs in deine Kategorien. Unsichere Tabs bleiben ungruppiert in der Hauptgruppe.
Doppelte Links und Text zwischen den Links werden ignoriert.

## Bedienung

**Klick auf das Symbol in der Symbolleiste:**
- **Vorschau** zeigt, welcher Tab wohin käme. Dabei wird nichts verschoben.
- **Jetzt sortieren** sortiert das aktuelle Fenster.
- **Neue Tabs automatisch einsortieren:** Ein Tab wird einsortiert, sobald er fertig geladen ist.
  Ist der Tab gerade im Vordergrund, wartet die Erweiterung, bis du zu einem anderen Tab wechselst.
- **Dieses Fenster nie sortieren** schließt das aktuelle Fenster aus, bis Safari neu startet.
  Das passt z. B., wenn du gerade in einer Safari-Tabgruppe arbeitest, die so bleiben soll.

**Einstellungen** (Link im Popup):
- **Kategorien:** Name und Stichwörter, durch Komma getrennt.
  - Ein Stichwort mit Punkt gilt als Domain, z. B. `github.com`. Ein Treffer bringt 3 Punkte, Subdomains zählen mit.
  - Ein normales Wort, z. B. `rechnung`, bringt 2 Punkte, wenn es im Domainnamen steht.
    Steht es im Titel oder in der Adresse, gibt es dort jeweils 1 Punkt.
- **Sicherheit:** Ein Tab wird nur verschoben, wenn er die Mindestpunktzahl erreicht.
  Außerdem darf keine andere Kategorie gleich viele Punkte haben. Sonst bleibt er in der Hauptgruppe.
- **Ausgeschlossene Gruppen:** Hier steht ein Name pro Zeile. Gruppen und Kategorie-Fenster mit diesem Namen
  werden nie angefasst. Tabs, die in diese Kategorie fallen würden, bleiben, wo sie sind.
- **Testen:** Gib eine Adresse ein und sieh sofort, wohin der Tab käme und wie viele Punkte er hat.

Angeheftete Tabs werden nie verschoben.

## Dateien

| Datei | Aufgabe |
|---|---|
| `manifest.json` | Beschreibung der Erweiterung (Manifest V3) |
| `classify.js` | Zuordnung eines Tabs zu einer Kategorie mit Punkten und Sicherheitsschwelle |
| `background.js` | Verschieben in Gruppen bzw. Fenster, Ausschlüsse, Automatik |
| `popup.html/js` | Popup in der Symbolleiste |
| `options.html/js` | Einstellungsseite |
| `style.css` | Gestaltung für helles und dunkles Erscheinungsbild |

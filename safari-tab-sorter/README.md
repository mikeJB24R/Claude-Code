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

## Installation (Mac mit Xcode)

1. Installiere **Xcode** aus dem App Store und starte es einmal.
2. Entpacke den Ordner `safari-tab-sorter` und öffne darüber das Terminal:
   ```bash
   xcrun safari-web-extension-converter safari-tab-sorter --app-name "Tab Sortierer" --macos-only
   ```
   Xcode öffnet sich mit dem erzeugten Projekt.
3. Klicke in Xcode auf **▶ (Run)**. Eine kleine App startet. Du kannst sie danach schließen.
4. In Safari: **Einstellungen → Erweitert → „Funktionen für Webentwickler anzeigen“** aktivieren.
   Dann **Entwickler → „Nicht signierte Erweiterungen erlauben“** wählen.
   Diese Einstellung musst du nach jedem Neustart von Safari erneut setzen.
5. **Einstellungen → Erweiterungen → „Tab Sortierer“** einschalten.
   Bei „Andere Websites“ wählst du „Erlauben“. Sonst kann die Erweiterung Titel und Adressen der Tabs nicht lesen.

Den Schritt mit „Nicht signierte Erweiterungen erlauben“ sparst du dir nur so:
Du signierst die App in Xcode mit einem Apple-Developer-Konto (Signing & Capabilities → Team).

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

# UX-Recherche: Mobbin-Referenzen für die Options-Seite

Stand: 2026-10-30 · Bereich: `options.html` / `options.css` / `src/interfaces/options/*`
Status: **Vorschlag, keine Implementierung.** Alle Zeilenangaben gegen `main` (Commit `58467aa`).
Mobbin-Suche: `platform: web`, `output_destination: code`, Modus `standard`.

---

## 0. Vorbefund: zwei parallele Options-Implementierungen

`webpack.config.js:9–12` baut `options-bundle.js` **ausschliesslich** aus `options.ts`, und
`options.html:605` lädt genau dieses Bundle. Der DI-Stack unter `src/interfaces/options/`
(`OptionsScript.ts`, `SettingsForm.ts`, `TagManagementUI.ts`, …) wird von nirgends importiert —
`OptionsScript.ts:579` startet sich zwar selbst, das Modul landet aber in keinem Bundle
(`grep -rn "OptionsScript" src options.ts background.ts` → kein Importeur).
**Live ist der Monolith `options.ts`.**

Relevant, weil der ungenutzte Stack nicht mehr zum Markup passt:

- `SettingsForm.ts:385,387` verlangt `#general-options-form` und `#general-status-message`.
  Beide IDs existieren im HTML nicht (vorhanden: `#provider-options-form`,
  `options.html:72`). Ein Wechsel des Entry auf `OptionsScript` würde in
  `getDOMElements()` werfen (`SettingsForm.ts:401–403`) → `initialize()` bricht ab, Tabs 2–5
  initialisieren nicht.
- `SettingsForm.ts:396–399` fragt `zai-paas-api-key` / `zai-paas-model` / `zai-coding-*`;
  HTML (`options.html:254,266,296,308`) und `options.ts:341–345` nutzen `zaiPaasApiKey` /
  `zaiPaasModel` / `zaiCoding*`.

**Konsequenz für dieses Dokument:** der bindende Vertrag ist `options.ts`
(`options.ts:319–345` Selektor-Block, `449–485` Tab-Switching), nicht
`src/interfaces/options/`. Die ID-Liste unten ist damit kein Stilhinweis, sondern das, woran
zwei Implementierungen hängen. Die beiden Stack-Inkonsistenzen sind kein UX-Problem dieser
Runde, stehen aber in P2, damit ein „Entry umstellen“ nicht überrascht.

---

## 1. Set A — Provider- und API-Key-Konfiguration

Vier Referenzen, ein gemeinsames Muster: **eine Einstellung = eine Zeile**, Hilfe direkt am
Feld, optionaler Kram zugeklappt, ein einziger Primär-CTA.

| Referenz | Muster | Konkret borgen |
|---|---|---|
| [Mintlify – MCP/Settings](https://mobbin.com/screens/f7a25116-25cf-41e9-b15d-6f53e538f936) | Zeilen-Layout: Titel + 1-Satz-Hilfe links, Control rechts, Haarlinie dazwischen; Segmented Control als Varianten-Umschalter; Ghost-Button `+ Add domain` | Zweispaltige `definition-row` (Label/Hilfe ~55 %, Control ~260 px); Segment-Control als Provider-Umschalter; Ghost-Button für „Neuen Key hinzufügen“ |
| [AirOps – „Add an OpenAI API Key“](https://mobbin.com/screens/91d6e9d0-a072-4c90-a8a1-890f066f232d) | Key-Feld mit Label `Key`, Hilfetext **unter** dem Feld, ein voller Primär-CTA, Trust-Zeile in 12 px muted („encrypted … AES-256“) | Key-Eingabe: `<input>` + `.help-text` + `aria-describedby`; Vertrauens-Satz („wird lokal in IndexedDB gespeichert“) statt Werbeversprechen; ein CTA pro Block |
| [fal – „New Key“](https://mobbin.com/screens/97bfdbd6-4222-496b-9888-2a57f10ee03f) | Maskierter Wert (`2917…-93lb-`) + Copy-Button + Satz, wo der Key hingehört; Hilfetext pro Feld | Nach dem Speichern Key maskiert zurückzeigen (`••••` + letzte 4) mit Copy-Button; `navigator.clipboard` aus der Extension-Page, keine Permission nötig |
| [Snowflake – „Enter model details“](https://mobbin.com/screens/01aa36fa-e6e0-410f-933c-dc88bd95dacb) | Inline-Validierung als grüner Haken **im** Feld; „Advanced settings ⌄“ als Disclosure | Gültigkeits-Icon rechts im Feld (URL-Pattern bei `ollama-api-url`, Länge bei Keys); Base-URL/Model für Nicht-Ollama-Provider unter „Erweitert“ einklappen |

**Fit (tiny bundle, kein Framework):** alle vier sind reines Box-Model + `border`/`gap`.
Disclosure = `<details>`/`<summary>` (nativ, 0 Zeilen JS). Validierung ist im Markup schon
vorhanden (`pattern`/`title`, `options.html:82–84,116–117`) — es fehlt nur die sichtbare
Darstellung über `:invalid:not(:placeholder-shown)`. Keine Netzwerke, keine Assets.

---

## 2. Set B — Navigation für eine lange Einstellungsseite

Heute: horizontale `.tab-bar` (`options.html:14–20`, `options.css:213–253`), auf 768 px
werden die fünf Buttons zu 20 %-Spalten gequetscht (`options.css:463–471`) — „Benutzerdefinierte
Tags“ bricht dort um.

| Referenz | Muster | Konkret borgen |
|---|---|---|
| [incident.io – Settings-Übersicht](https://mobbin.com/screens/46d077f5-4fd4-448c-909c-c3c83276b14f) | Vertikale Rail mit **Gruppenlabels**, aktiver Eintrag als gefüllte Pille; Hauptbereich als Karten-Grid mit Titel + 1-Satz-Beschreibung | `.tab-bar` → `flex-direction: column`, Breite 220 px, sticky; Gruppenlabel (11 px, uppercase, muted) über „Provider / Tags / Ergebnisse“; aktiver Tab = gefüllte Pille statt Unterstrich |
| [Buffer – „Preferences“](https://mobbin.com/screens/0398e56b-5120-4055-9348-2b046ded2e97) | Rail-Gruppen `Account / Organization / Features / Other`; jede Zeile: Label + Hilfetext links, Control rechts, Haarlinie; Theme-Picker als Button mit Icon | Exakt das Zeilenraster aus Set A wiederverwenden; „Darstellung“-Zeile mit Hell/Dunkel/Auto-Select |
| [Quicken – „Tags / Categories“](https://mobbin.com/screens/705172e9-49e2-4c90-9825-76d579608cd5) | Tags als Chip-Grid statt Liste; darunter Tabelle; **Toast unten links mit „Undo“** | Custom-Tags (`options.html:370–383`, `#tag-list-container`): Chips statt `.tag-item`-Karten; Feedback als Toast mit Undo statt `.status-message`-Text |
| [Ferndesk – Help-Center-Nav](https://mobbin.com/screens/74c89d64-4ea4-41f3-b2b6-5a7c02d03df6) | „Save changes“ sticky im Seitenkopf, nur bei Änderungen; Gruppen mit `+` und Drag-Handle | Speichern-Button in den Kopf ziehen, `disabled` solange `dirty === false`; das ersetzt vier verstreute Speichern-Buttons |

**Fit:** Der Tab-Contract ist reines CSS. `options.ts:449–485` hört auf
`.tab-button[data-tab]` und schaltet `.tab-content.active` — **null TS-Änderung** für eine
vertikale Rail. Die vier separaten Speichern-Buttons (`options.html:380,398,446`) bleiben
funktional unangetastet; ein sticky Kopf-Button kann auf die vorhandenen Handler zeigen.
Chip-Grid ist `display:flex; flex-wrap:wrap` — kein Virtualisierungs-, kein Framework-Bedarf
bei realistischen 5–30 Tags.
Achtung Undo: nur umsetzen, wenn die Aktion reversibel ist (siehe offene Fragen).

---

## 3. Set C — Batch-/Hintergrundverarbeitung sichtbar machen

Heute vorhanden: `<progress id="debug-batch-progress">` (`options.html:479`), Phasen-Badge
(`:474`), sechs Kennzahlen (`:484–508`), Log-Liste (`:540`). Es fehlt die Erzählung
„was passiert gerade / was kommt noch“.

| Referenz | Muster | Konkret borgen |
|---|---|---|
| [SoundCloud – „Generating mastered track“](https://mobbin.com/screens/cdaf74c3-e039-4276-ae2c-82025124ff20) | Stepper mit ✓ / ● / ○ je Phase, Prozentbalken darunter, Live-Statustext in einer Zeile | Stepper „Einlesen → Analysieren → Tags anwenden → Fertig“ über dem Balken; `#debug-batch-progress-text` als aktive Phasenbeschreibung, nicht als Zahl |
| [AirOps – „Exploring Prompts“](https://mobbin.com/screens/eb7dfcde-15f6-4a4d-a133-0d10ab331a9f) | Vertikale Checkliste: ✓ erledigt, Spinner aktiv, ausgegraut ausstehend; darunter „This may take a couple of minutes. Feel free to navigate away.“ | Phasen-Checkliste statt reiner Prozentzahl; Hinweis „läuft im Hintergrund weiter“ (stimmt hier: `background.ts` verarbeitet, die Seite pollt nur) |
| [Plane – Projekt-Übersicht](https://mobbin.com/screens/8a0d7652-7b45-4a3d-ae48-86490ec11520) | KPI-Kacheln (24 / 16 / 25) oben, darunter Status-Legende mit Farbpunkt + Zahl (Backlog 6, Not started 3, …) | `.debug-stats-grid` (`options.css:1213–1240`) bekommt Status-Farbpunkte; Badge-Zeile zeigt Verteilung statt sechs gleichgewichtiger Zahlen |
| [Browserbase – Run-Ansicht](https://mobbin.com/screens/38e3e1bc-2a5c-4f7b-aa64-00ab6f736224) | Kopf: Status links, `Stop` / `Optimize` rechts oben; pro Schritt Dauer rechtsbündig; rechtes Panel „Run in progress“ | `.debug-queue-panel`-Kopf (`options.html:454–461`): StatusBadge links, `#debug-cancel-batch-btn` rechts, Dauer je Log-Zeile in eigener Spalte |

**Fit:** Alles CSS auf bereits existierenden Elementen — `<progress>` bleibt, der Stepper ist
ein `<ol>` mit `data-state`-Attributen, die der bestehende Poller setzt (`DebugTab.ts` schreibt
schon Badge-Klassen). Kein Timer, kein Websocket, keine neue Quelle der Wahrheit.

---

## 4. Code-Mapping

### 4.1 Markup — `options.html`

| Zeilen | Inhalt | Regel |
|---|---|---|
| 14–20 | `.tab-bar` mit 5 `.tab-button[data-tab]` | Markup ergänzbar (`role`/`aria-selected`, Gruppenlabels), `data-tab` + Reihenfolge **fix** |
| 22–38 | `#provider-settings`, `#provider`-Select | IDs fix; Select bleibt nativ |
| 40–69 | Konfidenz-Slider + Number-Input | **Inline-Styles `:44`, `:52`, `:61`** müssen in CSS-Klassen wandern |
| 72–333 | `#provider-options-form` mit 9 `.provider-settings`-Blöcken | Block-IDs (`ollama-settings` … `zai-coding-settings`) **fix**; die Sichtbarkeit schaltet `options.ts:250–252` über die Klasse `.provider-settings` |
| 335 | `#provider-status-message` | bleibt (Selector `options.ts:329–330`) |
| 341–367 | Notfall-Stopp + Cache-Karten | IDs fix; Markup frei |
| 370–383 | Custom-Tags | `#tag-list-container` wird von `TagManagementUI.ts` befüllt |
| 404–448 | Manuelle Überprüfung | unverändert in dieser Runde |
| 451–543 | Debug: Queue + Log | `#debug-*`-IDs sind Poller-Vertrag (`DebugTab.ts`) |
| 546–591 | Tag-Modal | IDs fix (`tag-name`, `tag-key`, `tag-color`, `tag-prompt`, `tag-threshold`) |
| 593–605 | Fehler-Overlay | IDs fix |

### 4.2 Styles — `options.css`

| Zeilen | Inhalt | Aktion |
|---|---|---|
| 1–37 | `:root` Tokens | **erweitern** (Abschnitt 5), bestehende Namen nicht umbenennen |
| 39–82 | `body` / `.container` / Typo | `--color-white`/`--color-gray-100` → neue Surface-Aliase |
| 83–133 | `.form-group`, `label`, Inputs, `:focus`, `.help-text` | Basis für Zeilen-Layout + `:focus-visible` |
| 135–204 | Buttons (`.btn-primary/-secondary/-danger`) | nur Focus-Ring ergänzen |
| 206–211 | `#general-status-message` | **toter Code** (ID fehlt im HTML) → P2 löschen, sobald (a) gefixt |
| 213–253 | `.tab-bar` / `.tab-button` / `.tab-content` | Kern des Set-B-Umbaus |
| 263–320 | `.provider-section`, `.provider-settings-container/-settings` | Set A |
| 322–349 | `.privacy-notice` | in „Erweitert“-Disclosure verschiebbar |
| 350–412 | System-Karten | Set C Kopf |
| 422–429 | `.status-message` | durch Toast ergänzen, nicht ersetzen |
| 434–471 | `@media (max-width: 768px)` | Rail muss hier zur horizontalen Leiste zurückfallen |
| 1134–1247 | Debug-Queue, Badges, Progress, Stats | Set C |
| 1249–1341 | Debug-Log (4-Spalten-Grid `:1275`) | Spalten bei < 768 px prüfen (`:1344–1357`) |
| 271–304 + 452–462 | `.provider-tabs` / `.provider-tab` | **toter Code**, im HTML nicht verwendet → P2 löschen |

### 4.3 Nicht anfassen (TS-Vertrag, live = `options.ts`)

- `options.ts:319–345` — Selektor-Block (`#provider`, `#provider-options-form`,
  `#provider-status-message`, alle Provider-Felder); hier hängt das Speichern dran
- `options.ts:250–252` + `showRelevantSettings` — Sichtbarkeit über Klasse `.provider-settings`
- `options.ts:449–485` — Tab-Switching über `.tab-button[data-tab]` + `.tab-content.active`;
  `debugTab.onTabVisibilityChanged()` startet/stoppt das Polling (`options.ts:486`)
- `DebugTab.ts` — `#debug-*`, Klassen `debug-batch-{idle,running,completed,cancelled,error}`
- `manifest.json:24–26` — CSP `script-src 'self'`: kein CDN-Font, kein Inline-`<script>`,
  kein `eval`. Schrift bleibt der System-Stack (`options.css:40–42`). Icons als Inline-SVG im
  HTML oder Unicode — keine Icon-Font.

---

## 5. Design-Tokens

Vorgehen mit minimalem Diff: **Alias-Tokens** einführen, die im Light-Mode auf die
bestehenden Variablen zeigen; im Dark-Mode nur die Aliase + die Text-/Border-Tokens
überschreiben. Konkret betroffen sind **23 Regeln** mit Flächenfarbe:

```bash
# `background(-color)?: var(--color-white)`  → 11 Stellen (52,242,306,361,494,560,706,932,947,1037,1152)
# `background(-color)?: var(--color-gray-100)` → 12 Stellen (44,235,282,414,749,856,910,957,1010,1225,1262,1290)
sed -i -E 's/background(-color)?: var\(--color-white\)/background\1: var(--surface-1)/; s/background(-color)?: var\(--color-gray-100\)/background\1: var(--surface-0)/' options.css
```

`color: var(--color-white)` (13 Stellen: 148,168,188,299,805,996,1063,1085,1104,1174,1179,1189,1325)
bleibt **absichtlich** unangetastet —
das ist weiße Schrift auf farbigen Buttons. Deshalb wird `--color-white` im Dark-Mode auch
**nicht** überschrieben.

```css
/* options.css, nach :root (Zeile 37) */
:root {
  color-scheme: light dark;            /* native select/progress/color folgen dem Theme */

  /* Semantic layer — zeigt im Light-Mode auf die Bestandstokens */
  --surface-0: var(--color-gray-100);  /* Seitenhintergrund */
  --surface-1: var(--color-white);     /* Karte / Container */
  --surface-2: #f9fafb;                /* eingelassene Flächen (Cards, Toolbar) */
  --border-subtle: var(--color-gray-200);
  --border-strong: var(--color-gray-300);
  --text-muted: #667085;               /* ersetzt --color-gray-600 für Hilfetext */
  --focus-ring: 0 0 0 3px rgba(0, 123, 255, 0.25);

  /* Typo-Skala (bisher ad hoc: 12/13/14/18/24) */
  --font-xs: 12px;  --font-sm: 13px;  --font-md: 14px;
  --font-lg: 16px;  --font-xl: 20px;  --font-2xl: 24px;
  --line-tight: 1.3; --line-normal: 1.5;

  /* Spacing bleibt wie vorhanden (5/10/15/20/25/30) — kein Churn */
}

@media (prefers-color-scheme: dark) {
  :root {
    --surface-0: #16181d;
    --surface-1: #1e2127;
    --surface-2: #262a31;
    --border-subtle: #34383f;
    --border-strong: #4a4f58;

    --color-text-primary: #e8eaed;     /* Bestandstoken überschreiben = ein Ort */
    --color-text-secondary: #c3c7ce;
    --color-text-tertiary: #aab0ba;
    --color-gray-600: #9aa0aa;
    --color-gray-700: #c3c7ce;
    --color-gray-200: #2b2f36;
    --color-gray-100: #22262c;
    --color-gray-300: #4a4f58;
    /* --color-white bleibt weiss: es ist die Schriftfarbe auf farbigen Buttons */

    --color-primary: #4da3ff;
    --color-primary-dark: #7dbcff;
    --color-primary-light: rgba(77, 163, 255, 0.15);
    --color-success: #4ade80;
    --color-danger: #f1666e;
    --color-warning: #fbbf24;

    --focus-ring: 0 0 0 3px rgba(77, 163, 255, 0.35);
    --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.35);
    --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.45);
    --shadow-lg: 0 6px 12px rgba(0, 0, 0, 0.55);
  }
}
```

Zwei harte Farben bleiben außerhalb der Tokens und müssen mit: `.debug-level-warn`
(`options.css:1318–1321`, `#fff3cd` / `#856404`) und `.debug-level-error` (`:1323–1326`,
weiße Schrift auf `--color-danger`).

Zusätzlich an einer Stelle:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

---

## 6. Priorisierung

### P0 — Barrierefreiheit, vor jedem Schönheitsbau
1. **Fokus sichtbar:** `button` hat keinen Focus-Style (`options.css:135–204`) — Tabs,
   Karten-Buttons und `.btn-small` sind per Tastatur nicht auffindbar. Ein Block:
   `:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }`
2. **Slider ohne Label:** `options.html:45–53` hat kein `<label>`, nur die Number-Input-Variante
   (`:41`). Ergänzen: `aria-label` + `aria-describedby="…help"` auf `.help-text` (`:64`).
3. **Tab-Semantik:** `.tab-bar` (`options.html:14`) bekommt `role="tablist"`,
   `.tab-button` `role="tab"` + `aria-selected`; das Tab-Switching in `options.ts:459–485`
   setzt die Klasse, nicht das Attribut → entweder Attribut dort mitpflegen oder rein CSS.

### P1 — das eigentliche Redesign
4. Rail-Navigation statt Tab-Leiste (Set B, incident.io + Buffer), inkl. Mobile-Rückfall.
5. Provider-Zeilen: Label/Hilfe links, Control rechts; „Erweitert“-Disclosure für Base-URL/Model
   (Set A, Mintlify + Snowflake).
6. Status-Feedback vereinheitlichen: Toast mit `role="status"` statt vier separater
   `.status-message`-Spans (AirOps-Muster), Undo nur wo reversibel.
7. Batch-Erzählung: Stepper + Phasentext + „läuft im Hintergrund weiter“ (Set C).
8. Dark Mode über `prefers-color-scheme` (Abschnitt 5).

### P2 — Polish
9. Toten CSS-Code löschen: `#general-status-message` (`options.css:206–211`),
    `.provider-tabs/.provider-tab` (`:271–304`, `:452–462`).
10. Inline-Styles in Markup (`options.html:44,52,61`) durch Tokens ersetzen.
11. `.debug-log-row` 4-Spalten-Grid (`options.css:1275`) auf schmalen Viewports prüfen.
12. Custom-Tags als Chip-Grid (Quicken).
13. **Stack-Inkonsistenz:** `#general-options-form`/`#general-status-message` in
    `SettingsForm.ts:385,387` bzw. ZAI-IDs (`:396–399`) gegen das HTML angleichen — oder den
    ungenutzten `src/interfaces/options/`-Stack löschen.

---

## 7. Bewusst weggelassen

- **Keine UI-Bibliothek, kein Framework, kein Build-Umbau.** Webpack-Bundle bleibt.
- **Kein Icon-Set / keine Icon-Font** (CSP: kein CDN). Nur Inline-SVG oder Unicode.
- **Kein Dark-Mode-Schalter in den Einstellungen** — nur `prefers-color-scheme`; ein manueller
  Toggle bräuchte Persistenz + Repaint-Logik in `options.ts`.
- **Kein Undo für „Queue leeren“** (`options.html:349`) — nicht reversibel ohne Re-Enqueue-Pfad;
  dort bleibt eine Bestätigung.
- **Keine Provider-Suche/Command-Palette** — 5 Tabs rechtfertigen keine Suchleiste
  (incident.io hat sie, wir nicht).
- **Keine i18n-Einführung.** UI bleibt deutsch; die Referenzen sind englisch, übernommen wird
  nur das Muster.
- **Keine Übernahme von Mobbin-Assets, Farben oder Schriftarten.** Nur Layout, Abstände,
  Zustände.
- **Kein Redesign von „Analyseergebnisse“ und „Manuelle Überprüfung“** in dieser Runde
  (`options.css:684–1132`) — eigener Durchgang.

---

## 8. Offene Fragen (nicht raten)

1. Ist der ungenutzte `src/interfaces/options/`-Stack (Abschnitt 0) Altlast zum Löschen oder
   geplanter Nachfolger? Das entscheidet, ob P2/13 „angleichen“ oder „löschen“ heisst.
2. Soll Feedback einheitlich als Toast laufen (Undo-Muster) oder bleiben die Inline-Status-Spans
   (`#provider-status-message`, `#cache-status-message`, `#save-*-status-message`)? Toast kostet
   ein zusätzliches DOM-Element und ~20 Zeilen CSS/JS.
3. Ist ein Undo für Custom-Tag-Löschen gewünscht und reversibel (die Tag-Liste liegt im
   Modulzustand von `options.ts`)? Wenn nein, entfällt das Quicken-Muster.
4. Dark Mode: reicht `prefers-color-scheme`, oder braucht es einen expliziten Schalter?

---

## 9. Umsetzungsstand (2026-10-30)

Freigegeben und umgesetzt: **P0 (#1–#3)** und **Set A (#4–#8)** des Abschnitts 6.
Branch `ux/mobbin-p0-setA`, Dateien: `options.html`, `options.css`, `options.ts`,
`test/options-provider-connection.test.ts`, `test/options-markup-a11y.test.ts`,
`test/options-page-init.test.ts`.

Geändert gegenüber dem Vorschlag:

- **Set A ohne Modal:** Keys werden inline editierbar (Zeilenraster), nicht in einem Dialog —
  ein Modal hätte Fokus-Falle und Escape-Handling gebraucht, das der Vorschlag nicht verlangte.
- **Verbindungstest via `listModels()`** statt eines eigenen HTTP-Probes: derselbe Codepfad wie
  `fetchZaiModels()` in `src/infrastructure/providers/index.ts`. Folge: der Provider schluckt
  HTTP-Status (401/500) und liefert `[]`; die UI kann deshalb nur „keine Modelle erhalten“
  melden, nicht den Statuscode. Ein Statuscode-Fehlerbild bräuchte eine Änderung an
  `BaseProvider`/den Impls — außerhalb des freigegebenen Dateisatzes.
- **Kein Undo/Toast:** Feedback bleibt bei den vorhandenen Status-Spans (jetzt mit
  `aria-live` und Danger-Farbe), weil ein Toast zusätzliches DOM plus Timer-Verwaltung
  bedeutet hätte.

Weiter offen (nicht freigegeben): Dark Mode, Rail-Navigation (Set B), Batch-Stepper (Set C),
Chip-Grid für Tags, Löschen des ungenutzten `src/interfaces/options/`-Stacks.

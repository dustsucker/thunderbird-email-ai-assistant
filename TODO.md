# TODO: Thunderbird Email AI Assistant

Organisierte Liste von Problemen und Verbesserungsmöglichkeiten

## Kritisch (Sicherheits- und Architekturprobleme)

- [x] Fehlerbehandlung bei API-Requests (Schwierigkeit: 3/5, Datei: providers/ollama.js, providers/openai.js, providers/claude.js, providers/gemini.js, providers/mistral.js, providers/deepseek.js)
  - **Beschreibung:** Kein Retry-Mechanismus, kein exponentielles Backoff bei API-Fehlern
  - **Warum wichtig:** API-Aufrufe können temporär fehlschlagen (Netzwerkprobleme, Rate-Limits, Server-Ausfälle). Ohne Retry verliert die Extension Daten und Nutzererfahrung leidet.
  - **Vorgeschlagene Lösung:** Implementiere Retry-Logik mit exponentiellem Backoff (3-5 Retries, Basis: 1s, Faktor: 2, Jitter: +/- 50%)

- [x] Antwortvalidierung der LLM-Antworten (Schwierigkeit: 4/5, Datei: providers/utils.js, alle Provider-Dateien)
  - **Beschreibung:** Keine Validierung ob LLM gültiges JSON mit erwartetem Schema zurückgibt
  - **Warum wichtig:** LLMs können ungültiges JSON oder fehlerhafte Strukturen zurückgeben, was zu Abstürzen oder falschen Tags führt.
  - **Vorgeschlagene Lösung:** Schema-Validierung hinzufügen (z.B. mit ajv oder Zod), defensive Programmierung, Fallback-Strategien bei ungültigen Antworten

- [ ] Manifest V2 → V3 Migration (Schwierigkeit: 5/5, Datei: manifest.json)
  - **Beschreibung:** Extension nutzt veraltetes Manifest V2, welches in Zukunft nicht mehr unterstützt wird
  - **Warum wichtig:** Thunderbird wird Manifest V3 bald als Standard erzwingen. Veraltete Extensions werden nicht mehr funktionieren.
  - **Vorgeschlagene Lösung:** Vollständige Migration zu Manifest V3 (background scripts → service workers, permissions overhaul, CSP-Anpassungen)

## Wichtig (Funktionalität & UX)

- [x] Batch-Verarbeitung für parallele E-Mail-Analyse (✅ erledigt am 24.12.2025, Schwierigkeit: 2/5, Datei: background.ts, options.html, options.css, options.ts)
  - **Beschreibung:** E-Mails werden sequenziell in einer for-Schleife verarbeitet
  - **Warum wichtig:** Bei vielen eingehenden E-Mails dauert die Verarbeitung unnötig lange. Parallele Verarbeitung reduziert Wartezeit deutlich.
  - **Implementiert:**
    - Parallele E-Mail-Verarbeitung mit Promise.allSettled für bessere Fehlerisolation
    - Batch-Size Limit von 10 E-Mails gleichzeitig zur Vermeidung von API-Limits
    - "Analysiere alle E-Mails" Button in options.html für manuelle Batch-Verarbeitung
    - Batch-Progress Tracking mit dynamischer Progress Bar in UI
    - Cancel-Funktion zum Abbrechen laufender Analysen
    - Storage-basierte Progress-Synchronisation für Persistenz über Sessions hinweg
    - Verbesserte API-Funktionen mit Fehlerbehandlung für parallele Requests

- [x] Rate-Limiting-Schutz (Schwierigkeit: 3/5, Datei: background.js)
  - **Beschreibung:** Bei vielen E-Mails werden API-Limits überschritten, keine Warteschlange
  - **Warum wichtig:** API-Provider haben Rate-Limits (z.B. OpenAI: 500 req/min). Überschreitung führt zu Fehlern und Account-Sperrung.
  - **Vorgeschlagene Lösung:** Implementiere Warteschlange mit Rate-Limiting pro Provider, Token-Bucket-Algorithmus, Priorisierung von wichtigen E-Mails

- [x] Kein Status-Indicator (Schwierigkeit: 2/5, Datei: background.js)
  - **Beschreibung:** Nutzer sieht nicht ob Analyse läuft, erfolgreich war oder fehlgeschlagen ist
  - **Warum wichtig:** Bei langsamen LLMs oder Fehlern weiß der Nutzer nicht, was passiert. Schlechte User Experience.
  - **Vorgeschlagene Lösung:** Badge-Icon im Thunderbird UI, Notifications bei Fehlern, Logging-Option für Nutzer

- [ ] Kein Undo-Mechanismus (Schwierigkeit: 3/5, Datei: background.js:63)
  - **Beschreibung:** Einmal zugewiesene Tags können nicht einfach rückgängig gemacht werden
  - **Warum wichtig:** Falsche AI-Entscheidungen können nur manuell korrigiert werden. Nutzerfrust.
  - **Vorgeschlagene Lösung:** History-Log in storage, Undo-Funktion im Kontextmenü, Tag-Änderungen tracken

## Moderat (Code-Qualität)

- [ ] Performance-Monitoring und Metriken (Schwierigkeit: 3/5, Datei: background.js, providers/*.js)
  - **Beschreibung:** Keine Überwachung von API-Antwortzeiten, Erfolgsraten und Kosten
  - **Warum wichtig:** Ohne Metriken ist es schwer Performance-Probleme zu erkennen und zu optimieren.
  - **Vorgeschlagene Lösung:** Analytics-Integration, Dashboard für Metriken, Cost-Tracking

- [x] TypeScript Migration (✅ erledigt am 24.12.2025)
  - **Beschreibung:** Vollständige Migration von JavaScript zu TypeScript
  - **Was gemacht:** Alle 11 JS-Dateien zu TypeScript migriert (background, options, core/*, providers/*)
  - **Neue Features:** Strict Types, Type Guards, Interfaces für Typ-Sicherheit
  - **Build-Konfiguration:** tsconfig.json, webpack mit ts-loader für TypeScript-Compilation
  - **Dependencies:** typescript, ts-loader, @types/chrome, @types/node
  - **Ergebnis:** Kompilierzeitliche Typprüfung, bessere IDE-Unterstützung, sicherere Refactorings

- [ ] Keine Unit-Tests (Schwierigkeit: 4/5, Datei: Alle Dateien)
  - **Beschreibung:** Kein Testframework, keine Test-Files
  - **Warum wichtig:** Code-Änderungen können bestehende Funktionalität brechen. Regressionen sind schwer zu finden.
  - **Vorgeschlagene Lösung:** Test-Setup (Jest oder Vitest), Unit-Tests für core/ Funktionen, Integrationstests für Provider

- [ ] Duplizierter Provider-Code (Schwierigkeit: 3/5, Datei: providers/*.js)
  - **Beschreibung:** Alle Provider-Dateien haben ähnliche Struktur und wiederholen Code
  - **Warum wichtig:** Wartungsaufwand hoch, Änderungen müssen in allen Dateien gemacht werden, Code-Smell.
  - **Vorgeschlagene Lösung:** Abstrakte BaseProvider-Klasse, Factory-Pattern, Konfiguration statt Code-Duplizierung

- [x] Verbesserte Logging-Strategie (Schwierigkeit: 2/5, Datei: Alle Dateien)
  - **Beschreibung:** Nur console.log/console.error ohne Log-Level, keine Strukturierung
  - **Warum wichtig:** Debugging in Produktion schwierig, Log-Verschmutzung in Console.
  - **Vorgeschlagene Lösung:** Structured Logging (z.B. winston oder pino), Log-Level (DEBUG, INFO, WARN, ERROR), Filterbare Logs

## Gering (Nice-to-Have)

- [ ] Erweiterbare Provider-Struktur (Schwierigkeit: 3/5, Datei: providers/index.js)
  - **Beschreibung:** Neue Provider müssen manuell in index.js registriert werden
  - **Warum wichtig:** Community-Contributions und Plugin-Erweiterungen werden erschwert.
  - **Vorgeschlagene Lösung:** Dynamic Import, Plugin-System, Provider-Discovery-Mechanismus

- [ ] Konfigurierbare Modelle für Cloud-Provider (Schwierigkeit: 2/5, Datei: options.js, providers/*.js)
  - **Beschreibung:** Cloud-Provider-Modelle sind hardcoded, nicht im UI änderbar
  - **Warum wichtig:** Nutzer können günstigere/neuere Modelle nicht wählen ohne Code-Änderungen.
  - **Vorgeschlagene Lösung:** Model-Selector in Options-UI, API-Aufruf für verfügbare Modelle, User-Preferences

- [ ] Cache für LLM-Analysen (Schwierigkeit: 2/5, Datei: background.js)
  - **Beschreibung:** Gleiche E-Mails werden mehrfach analysiert ohne Cache
  - **Warum wichtig:** Bei E-Mail-Forwarding oder Retrying werden gleiche Analysen erneut bezahlt.
  - **Vorgeschlagene Lösung:** Hash-basierter Cache in IndexedDB, TTL-Strategie, Cache-Stats in UI

- [ ] Performance-Optimierung für große E-Mails (Schwierigkeit: 2/5, Datei: core/analysis.js, background.js:30)
  - **Beschreibung:** Ganze E-Mails inkl. Anhänge an LLM gesendet, Truncation nicht konfigurierbar
  - **Warum wichtig:** Hohe Token-Kosten, langsame Antwortzeiten bei großen E-Mails.
  - **Vorgeschlagene Lösung:** Intelligentes Truncation, Anhänge-Skipping, Token-Budgeting pro E-Mail

- [ ] Export/Import von Konfiguration (Schwierigkeit: 2/5, Datei: options.js)
  - **Beschreibung:** Einstellungen können nicht exportiert/importiert werden
  - **Warum wichtig:** Migration zwischen Computern, Backups, Sharing von Konfigurationen nicht möglich.
  - **Vorgeschlagene Lösung:** JSON-Export/Import-Funktion, Validierung bei Import, Versionierung von Configs

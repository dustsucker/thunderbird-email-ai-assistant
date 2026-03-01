# TODO: Thunderbird Email AI Assistant

Organisierte Liste von Problemen und Verbesserungsmöglichkeiten

---

## 🔴 Kritisch - Architektur & Sicherheit (aus Brutal Review)

### Typ-Deduplizierung ✅ ERLEDIGT

- [x] `Tag` Interface - War 3x definiert, jetzt 1x in `TagTypes.ts`
- [x] `ThunderbirdTag` Interface - War 2x in derselben Datei, jetzt 1x
- [x] `IProviderSettings` - Semantisch getrennt: `IRuntimeProviderSettings` (flexibel) + `IProviderSettings` (strikt)
- [x] `StorageCustomTags` und `CustomTags` - War 4x definiert, jetzt 1x

### Domain Layer von Infrastructure entkoppeln ✅ ERLEDIGT

- [x] `src/domain/interfaces/` erstellt für Domain-eigene Interfaces
- [x] `ITagManager` Interface nach `src/domain/interfaces/ITagManager.ts` verschoben
- [x] `ILogger` Interface nach `src/domain/interfaces/ILogger.ts` verschoben
- [x] Alle Domain Services nutzen nur noch Domain Interfaces
- [x] Infrastructure implementiert Domain Interfaces (Dependency Inversion)
- [x] `ITagResponse` nach `@/shared/types/ProviderTypes.ts` verschoben
- [x] Deprecated Aliases in Infrastructure für Backward Compatibility

### Legacy `core/` Module Migration ✅ ERLEDIGT

- [x] Entscheidung: Deprecated Re-Exports für Backward Compatibility
- [x] `core/config.ts` → Re-exports von `@/shared/types/*`, `@/shared/constants/*`
- [x] `core/analysis.ts` → Re-exports von `@/infrastructure/providers/PromptBuilder`
- [x] `core/tags.ts` → Re-exports von `@/domain/services/TagService`, `@/shared/types/TagTypes`
- [x] `core/cache.ts` → Re-exports von `@/infrastructure/cache/AnalysisCache`
- [x] Tests migriert nach `test/infrastructure/cache/` und `test/domain/services/`
- [x] `background.ts` nutzt jetzt DI für TagService statt core/tags Import

### Manifest V3 Kompatibilität

#### Current State: Hybrid (V3 Version Number + V2 Architecture)

Das `manifest.json` verwendet `manifest_version: 3` mit V2-style `background.page` + `persistent: true`.
Dies ist ein Hybrid-Zustand - Thunderbird Bug mit `src` allow rules verhindert volle V3-Migration.

#### ✅ Bereits V3-Kompatibel

- [x] **Kein `localStorage`** - Verwendet `messenger.storage.local` API
- [x] **Kein DOM-Zugriff im Background** - Saubere Trennung
- [x] **Event Listener sind re-registrierbar** - Alle Handler haben `start()/stop()`:
  - `EmailEventListener`: `registerListeners()` / `unregisterListeners()`
  - `MessageHandler`: `registerMessageHandlers()` / `unregisterMessageHandlers()`
  - `BackgroundScript`: `initialize()` / `shutdown()`
- [x] **CSP Format** - Verwendet V3-style Object mit `extension_pages`
- [x] **Kein Remote Code** - Alle Provider sind lokale Bundles (code-splitting OK)
- [x] **DI Container Pattern** - Services sind injectable und re-creatable
- [x] **`onSuspend` Handler** - BackgroundScript.registerShutdownHandler() implementiert
- [x] **Persistente Daten in Storage API** - Alle Konfiguration in `storage.local` / IndexedDB

#### ⚠️ Anpassung nötig für volle Service Worker Kompatibilität

- [ ] **In-Memory State bei Termination** (Schwierigkeit: 3/5)
  - `MemoryCache` - Intentional transient, dokumentiert
  - `PriorityQueue` - Queue-Items gehen bei Termination verloren
  - `batchProgress` in MessageHandler - Laufende Batch-Progress verloren
  - `listenerState` Counter - Nicht kritisch (Statistiken)
  - **Lösung:** Batch-Progress in `storage.local` persistieren für Resume

- [ ] **Event Listener Cleanup** (Schwierigkeit: 2/5)
  - `InstallHandler` - Speichert keine Handler-Referenz (minor)
  - `ContextMenuHandler` - Speichert keine Handler-Referenzen (minor)
  - **Lösung:** Handler-Referenzen für `removeListener()` speichern

#### 🔴 Manifest-Änderungen für volle V3 Migration

- [ ] `background.page` → `background.service_worker` (Schwierigkeit: 5/5)
  - **Blockiert durch:** Thunderbird Bug mit `src` allow rules
  - **Workaround:** V2-style `background.page` + `persistent: true` beibehalten
  - **Referenz:** https://bugzilla.mozilla.org/show_bug.cgi?id=1852203

#### V3 Migrations-Pfad (wenn Thunderbird Bug gefixt)

1. Manifest: `background.page` → `background.service_worker`
2. Batch-Progress in `storage.session` persistieren
3. Queue-Items in `storage.local` für Resume nach Termination
4. Testen mit Service Worker Lifecycle (idle → suspend → wake)

#### Code-Dateien mit V3-Relevanz

| Datei                                       | Status    | Anmerkung                 |
| ------------------------------------------- | --------- | ------------------------- |
| `manifest.json`                             | ⚠️ Hybrid | V3 version, V2 background |
| `background.ts`                             | ✅ OK     | Entry point, DI bootstrap |
| `src/background/BackgroundScript.ts`        | ✅ OK     | onSuspend handler         |
| `src/background/EmailEventListener.ts`      | ✅ OK     | start/stop pattern        |
| `src/background/MessageHandler.ts`          | ⚠️ State  | batchProgress in-memory   |
| `src/background/ContextMenuHandler.ts`      | ⚠️ Minor  | Handler ref storage       |
| `src/background/InstallHandler.ts`          | ⚠️ Minor  | Handler ref storage       |
| `src/infrastructure/cache/MemoryCache.ts`   | ✅ OK     | Documented transient      |
| `src/application/services/PriorityQueue.ts` | ⚠️ State  | In-memory queue           |
| `options.ts`                                | ✅ OK     | UI code, DOM access OK    |

---

## 🟠 Wichtig - Refactoring (aus Brutal Review)

### AnalyzeEmail Use Case aufteilen ✅ ERLEDIGT

- [x] Neuer Use Case: `RetrieveEmailUseCase` - E-Mail laden
- [x] Neuer Use Case: `CacheAnalysisUseCase` - Caching Logic
- [x] Neuer Use Case: `ApplyTagsWithConfidenceUseCase` - Tags mit Confidence Filter
- [x] Neuer Use Case: `ExtractEmailContentUseCase` - Content Extraction
- [x] `AnalyzeEmail` reduziert auf Orchestration (~370 Zeilen, war 940)
- [x] Dependencies von 10 auf 9 reduziert (4 core + 4 sub-use-cases + logger)
- [x] DI Container in `background.ts` aktualisiert

### `background.ts` modularisieren ✅ ERLEDIGT

- [x] `types/thunderbird.d.ts` erstellt für Thunderbird API Declarations
- [x] `src/background/DIContainer.ts` - DI Setup extrahiert
- [x] `src/background/ContextMenuHandler.ts` - Context Menu Logic (482 Zeilen)
- [x] `src/background/ToolbarHandler.ts` - Toolbar Button Logic
- [x] `src/background/InstallHandler.ts` - Install/Update Handler
- [x] `src/background/BackgroundScript.ts` - Orchestrierung
- [x] `background.ts` als Entry Point (75 Zeilen, war 937)

### Security Hardening

- [ ] API Key Logging Audit - `maskApiKey()` konsequent anwenden
- [ ] `BaseProvider.ts:403` - Settings Object vor dem Loggen maskieren
- [ ] Sensitive Data in Error Messages vermeiden
- [ ] API Key Validation bei Provider Initialisierung

---

## 🟡 Moderat - Code-Qualität

### Test Coverage erhöhen

- [ ] Tests für Provider Implementierungen (OpenAI, Claude, Gemini, etc.)
- [ ] Integration Tests für DI Container
- [ ] Error Handling Path Tests
- [ ] MockProvider von `core/` Imports befreien
- [ ] Edge Case Tests
  - **Status:** ~60% Coverage, Ziel: 90%+

### Value Objects mit echter Validation

- [ ] `EmailAddress` Value Object mit Email-Validation
- [ ] `ApiKey` Value Object mit Format-Check
- [ ] `TagColor` Value Object mit Hex-Color Validation
- [ ] Immutable Value Objects sicherstellen

### Testability verbessern

- [ ] `IClock` Interface für `Date.now()` (Dependency Injection)
- [ ] `IRandom` Interface für UUIDs
- [ ] Alle externen Abhängigkeiten injectable

### Error Handling vereinheitlichen

- [ ] Custom Error Classes in `src/shared/errors/`
- [ ] `DomainError` Base Class
- [ ] `InfrastructureError` Base Class
- [ ] `ApplicationError` Base Class
- [ ] Konsistente Error Logging Strategy

### Weitere Code-Qualitäts-Items

- [x] ~~Fehlerbehandlung bei API-Requests~~ (Retry mit Backoff implementiert)
- [x] ~~Antwortvalidierung der LLM-Antworten~~ (Schema-Validierung)
- [x] ~~TypeScript Migration~~ (✅ erledigt am 24.12.2025)
- [x] ~~Verbesserte Logging-Strategie~~ (ILogger mit Log-Level)

---

## 🟢 Funktionalität & UX

### Bereits erledigt

- [x] Batch-Verarbeitung für parallele E-Mail-Analyse (✅ 24.12.2025)
- [x] Rate-Limiting-Schutz (Warteschlange implementiert)
- [x] Kein Status-Indicator (Badge-Icon, Notifications)

### Noch offen

- [ ] Kein Undo-Mechanismus (Schwierigkeit: 3/5)
  - **Lösung:** History-Log in storage, Undo-Funktion im Kontextmenü
- [ ] Performance-Monitoring und Metriken (Schwierigkeit: 3/5)
  - **Lösung:** Analytics-Integration, Dashboard für Metriken, Cost-Tracking
- [ ] Cache für LLM-Analysen (Schwierigkeit: 2/5)
  - **Lösung:** Hash-basierter Cache in IndexedDB, TTL-Strategie
- [ ] Performance-Optimierung für große E-Mails (Schwierigkeit: 2/5)
  - **Lösung:** Intelligentes Truncation, Token-Budgeting

---

## 🔵 Nice-to-Have

- [ ] Erweiterbare Provider-Struktur (Plugin-System)
- [ ] Konfigurierbare Modelle für Cloud-Provider im UI
- [ ] Export/Import von Konfiguration
- [ ] Architecture Decision Records (ADRs) erstellen
- [ ] README.md mit Architektur-Übersicht aktualisieren
- [ ] UI Code separieren (`options.ts` in `/ui` verschieben)

---

## 📊 Metriken

| Kategorie        | Vorher     | Aktuell    | Ziel     |
| ---------------- | ---------- | ---------- | -------- |
| Architecture     | 3/10       | 9/10 ✅    | 8/10     |
| Code Duplication | 2/10       | 8/10 ✅    | 9/10     |
| Type Safety      | 5/10       | 9/10 ✅    | 9/10     |
| Test Coverage    | ~60%       | ~60%       | 90%+     |
| DI Usage         | 7/10       | 9/10 ✅    | 9/10     |
| Code Structure   | 4/10       | 9/10 ✅    | 9/10     |
| **Overall**      | **4.5/10** | **8.5/10** | **8/10** |

---

## 🔧 Nach jedem Task

```bash
npm run type-check   # TypeScript validieren
npm run lint         # Linting
npm test             # Tests ausführen
npm run build        # Production Build
```

---

## 📝 Fortschritt tracken

- Gestartet: 2026-03-01
- Aktuell: Priorität 1 & 2 - Kern-Refactoring ✅ ABGESCHLOSSEN
- Nächster Schritt: Test Coverage erhöhen oder Security Hardening
- **Ziel 8/10 ERREICHT!** 🎉

### Erledigte Tasks

1. ✅ Typ-Deduplizierung - `TagTypes.ts` als Single Source of Truth
2. ✅ Domain Layer Entkopplung - Interfaces in `@/domain/interfaces/`
3. ✅ Legacy `core/` Migration - Deprecated Re-Exports
4. ✅ AnalyzeEmail Split - 4 neue Use Cases, 940→370 Zeilen
5. ✅ background.ts Modularisierung - 937→75 Zeilen (92% Reduktion)
6. ✅ TypeScript Fehler behoben - type-check clean

---

_Basierend auf Brutal Code Review - Rating: 4.5/10 → Ziel: 8/10_

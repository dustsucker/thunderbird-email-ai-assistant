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

### Manifest V2 → V3 Migration

- [ ] Manifest V3 Migration (Schwierigkeit: 5/5, Datei: manifest.json)
  - **Warum wichtig:** Thunderbird wird Manifest V3 bald als Standard erzwingen
  - **Lösung:** background scripts → service workers, permissions overhaul, CSP-Anpassungen

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

### `background.ts` modularisieren (926 Zeilen)

- [ ] `types/thunderbird.d.ts` erstellen für Thunderbird API Declarations
- [ ] `src/background/DIContainer.ts` - DI Setup extrahieren
- [ ] `src/background/ContextMenuHandler.ts` - Context Menu Logic
- [ ] `src/background/ToolbarHandler.ts` - Toolbar Button Logic
- [ ] `src/background/MessageHandler.ts` - Message Listener
- [ ] `background.ts` als Entry Point (max 50 Zeilen)

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
| Architecture     | 3/10       | 8/10 ✅    | 8/10     |
| Code Duplication | 2/10       | 8/10 ✅    | 9/10     |
| Type Safety      | 5/10       | 8/10 ✅    | 9/10     |
| Test Coverage    | ~60%       | ~60%       | 90%+     |
| DI Usage         | 7/10       | 9/10 ✅    | 9/10     |
| Code Structure   | 4/10       | 8/10 ✅    | 9/10     |
| **Overall**      | **4.5/10** | **7.5/10** | **8/10** |

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
- Nächster Schritt: `background.ts` modularisieren (926 Zeilen) oder Test-Failures fixen
- Geschätzte Zeit bis 8/10: 4-6 Wochen

### Erledigte Tasks

1. ✅ Typ-Deduplizierung - `TagTypes.ts` als Single Source of Truth
2. ✅ Domain Layer Entkopplung - Interfaces in `@/domain/interfaces/`
3. ✅ Legacy `core/` Migration - Deprecated Re-Exports
4. ✅ AnalyzeEmail Split - 4 neue Use Cases, 940→370 Zeilen

---

_Basierend auf Brutal Code Review - Rating: 4.5/10 → Ziel: 8/10_

# TODO: Thunderbird Email AI Assistant

Offene Probleme und Verbesserungsmöglichkeiten (Stand: 2026-03-01)

---

## 🔴 Kritisch - Production Blockers (aus Brutal Review #2)

### Placeholder Code in Production

- [ ] **`getCurrentTags()` ist Placeholder** (Schwierigkeit: 3/5)
  - **Location:** `src/application/use-cases/ApplyTagsToEmail.ts:502-513`
  - **Problem:** Methode gibt immer `[]` zurück → Tag-Merging kaputt
  - **Lösung:** Richtige Thunderbird API implementieren
  ```typescript
  // Aktuell:
  private async getCurrentTags(messageId: number): Promise<string[]> {
    return [];  // 💀 IMMER LEER!
  }
  ```

---

## 🟠 Wichtig - Testability Adoption

### IClock/IRandom werden ignoriert

Die Interfaces wurden gebaut, aber **nicht durchgängig genutzt**:

- [ ] **`Date.now()` direkt genutzt** (43+ Aufrufe)
  - `src/domain/entities/Email.ts` - **DOMAIN!** (Architektur-Verstoß)
  - `src/application/use-cases/AnalyzeEmail.ts` - 6 Aufrufe
  - `src/application/services/PriorityQueue.ts` - 3 Aufrufe
  - `src/infrastructure/cache/MemoryCache.ts` - 5 Aufrufe
  - `src/infrastructure/cache/AnalysisCache.ts` - 5 Aufrufe
  - `src/domain/events/*.ts` - Alle Event-Factorys nutzen `new Date()`
  - **Lösung:** IClock via DI injecten und nutzen

- [ ] **`Math.random()` in PriorityQueue** (Schwierigkeit: 2/5)
  - **Location:** `src/application/services/PriorityQueue.ts:190`
  - **Lösung:** IRandom injecten und nutzen

---

## 🟡 Moderat - Manifest V3 Kompatibilität

### Current State: Hybrid (V3 Version + V2 Architecture)

- [ ] **In-Memory State bei Termination** (Schwierigkeit: 3/5)
  - `PriorityQueue` - Queue-Items gehen bei Termination verloren
  - `batchProgress` in MessageHandler - Laufende Batch-Progress verloren
  - **Lösung:** Batch-Progress in `storage.local` persistieren

- [ ] **`background.page` → `background.service_worker`** (Schwierigkeit: 5/5)
  - **Blockiert durch:** Thunderbird Bug 1852203 (src allow rules)
  - **Workaround:** V2-style beibehalten
  - **Referenz:** https://bugzilla.mozilla.org/show_bug.cgi?id=1852203

---

## 🟢 Funktionalität & UX

- [ ] **Cache für LLM-Analysen** (Schwierigkeit: 2/5)
  - Hash-basierter Cache in IndexedDB, TTL-Strategie

- [ ] **Performance-Optimierung für große E-Mails** (Schwierigkeit: 2/5)
  - Intelligentes Truncation, Token-Budgeting

---

## 🔵 Nice-to-Have

- [ ] Erweiterbare Provider-Struktur (Plugin-System)
- [ ] Konfigurierbare Modelle für Cloud-Provider im UI
- [ ] Export/Import von Konfiguration
- [ ] UI Code separieren (`options.ts` in `/ui` verschieben)
- [ ] E2E Tests mit Playwright

---

## 📊 Metriken (Brutal Review #2)

| Kategorie     | Aktuell  | Ziel     | Anmerkung                                    |
| ------------- | -------- | -------- | -------------------------------------------- |
| Architecture  | 7/10     | 8/10     | Sauber geschichtet, DI-Inconsistency         |
| Code Quality  | 4/10     | 7/10     | Placeholder-Code, Date.now() direkte Nutzung |
| Test Coverage | 7/10     | 8/10     | Tests gut, aber IClock/IRandom umgangen      |
| Security      | 6/10     | 8/10     | API-Key Masking OK, crypto import gefixt     |
| Documentation | 6/10     | 7/10     | JSDoc gut, ADRs existieren                   |
| **Overall**   | **6/10** | **8/10** | Nicht production-ready                       |

---

## 🔧 Nach jedem Task

```bash
npm run type-check   # TypeScript validieren
npm run lint         # Linting
npm test             # Tests ausführen
npm run build        # Production Build
```

---

## 📝 Action Items (Priority)

| #   | Priority    | Issue                                         | Effort |
| --- | ----------- | --------------------------------------------- | ------ |
| 1   | 🔴 CRITICAL | `getCurrentTags()` Placeholder implementieren | 30 min |
| 2   | 🟠 HIGH     | `Date.now()` → `IClock` in AnalyzeEmail       | 30 min |
| 3   | 🟠 HIGH     | `Date.now()` → `IClock` in Domain Entities    | 30 min |
| 4   | 🟡 MEDIUM   | `Math.random()` → `IRandom` in PriorityQueue  | 10 min |
| 5   | 🟡 MEDIUM   | Domain Events → `IClock` injection            | 1 h    |
| 6   | 🟢 LOW      | Batch-Progress persistieren                   | 2 h    |

---

## ✅ Erledigte Tasks (Session 2026-03-01)

1. ✅ Typ-Deduplizierung - `TagTypes.ts`
2. ✅ Domain Layer Entkopplung - `@/domain/interfaces/`
3. ✅ Legacy `core/` Migration
4. ✅ AnalyzeEmail Split - 4 Use Cases
5. ✅ background.ts Modularisierung - 937→75 Zeilen
6. ✅ Provider Unit Tests - 218 Tests
7. ✅ DI Container Tests - 70 Tests
8. ✅ Use Case Tests - 79 Tests
9. ✅ Domain Event Tests - 49 Tests
10. ✅ Value Object Tests - 114 Tests
11. ✅ Security Hardening - API Key Masking
12. ✅ Error Handling System - 67 Tests
13. ✅ Testability Interfaces (IClock, IRandom) - 18 Tests
14. ✅ Event Listener Cleanup - 13 Tests
15. ✅ Undo Mechanism - 34 Tests
16. ✅ Performance Monitoring - 30 Tests
17. ✅ Architecture Decision Records - 6 ADRs
18. ✅ README Architecture Overview
19. ✅ CryptoRandom: Node.js → Web Crypto API (Critical Fix)

**Total Tests: 592+**

---

_Brutal Review Rating: 4.5/10 → 5/10 → 6/10 (nach Fixes)_

# E2E-Testing Dokumentation

## Übersicht

End-to-End (E2E) Testing mit echten Providern verifiziert die Funktionalität des Email-Tagging-Systems gegen echte API-Endpunkte. Dieses Projekt verwendet zwei Test-Strategien:

1. **Mock-Tests** (`test/e2e.test.ts`): Schnelle Tests mit simulierten Provider-Antworten
2. **E2E-Real-Provider-Tests** (`test/e2e-real-provider.test.ts`): Integrationstests mit echter ZAI API

Mock-Tests laufen immer und sind ideal für schnelle Feedback-Schleifen. E2E-Tests mit echten Providern werden übersprungen, wenn keine gültigen API-Credentials konfiguriert sind (`it.skipIf()`).

## Voraussetzungen

### Systemanforderungen
- **Node.js**: Version 18+ oder 20+ (empfohlen)
- **npm**: Version 9+ oder höher
- **Git**: Für Repository-Management

### API-Credentials
Für E2E-Tests mit echten Providern benötigen Sie:
- **ZAI API Key**: Gültiger API Key für ZAI (z.ai)
- Optional: Custom Base URL und Model-Konfiguration

### Test-Fixtures
Testdaten sind in `test/fixtures/` verfügbar:
- `business-email.eml`: Geschäfts-E-Mail für Partnership-Angebot
- `advertisement-email.eml`: Werbe-E-Mail mit Angeboten
- `personal-email.eml`: Persönliche E-Mail von einem Freund

## Setup

### 1. Repository klonen und Dependencies installieren

```bash
git clone <repository-url>
cd thunderbird-email-ai-assistant
npm install
```

### 2. `.env` Datei konfigurieren

Kopieren Sie die `.env.example` Datei und erstellen Sie eine `.env` Datei:

```bash
cp .env.example .env
```

Editieren Sie `.env` mit Ihren API-Credentials:

```bash
# ZAI API Keys für E2E-Tests
ZAI_API_KEY=your-actual-zai-api-key-here
ZAI_MODEL=glm-4.5
ZAI_VARIANT=paas
ZAI_BASE_URL=https://api.z.ai/api/paas/v4/chat/completions

# Timeout Konfiguration (ms)
TEST_API_TIMEOUT=30000
```

### 3. Konfiguration validieren

Stellen Sie sicher, dass Ihre `.env` nicht in Git committet wird (bereits in `.gitignore`):

```bash
cat .gitignore | grep .env
```

## Tests ausführen

### Alle Mock-Tests ausführen

Mock-Tests benötigen keine API-Credentials und laufen immer:

```bash
npm test
```

Oder mit Vitest direkt:

```bash
npx vitest run
```

### Nur E2E-Tests mit echtem Provider

E2E-Tests mit echten Providern werden nur ausgeführt, wenn gültige API-Credentials konfiguriert sind:

```bash
npx vitest run test/e2e-real-provider.test.ts
```

**Erwartetes Verhalten ohne API-Key:**
```
Test Files  1 skipped (1)
Tests  6 skipped (6)
```

### Nur E2E-Tests ohne echten Provider (Mock-basiert)

Alle Tests mit simulierten Responses:

```bash
npx vitest run test/e2e.test.ts
```

### Tests mit Coverage

Coverage-Report generieren:

```bash
npm run test:coverage
```

Oder:

```bash
npx vitest run --coverage
```

Coverage-Report wird erstellt in:
- Terminal-Ausgabe (Text-Format)
- `coverage/index.html` (Interaktiver HTML-Report)

### Watch-Mode

Tests im Überwachungsmodus ausführen (bei Änderungen automatisch neu ausführen):

```bash
npm run test:watch
```

### UI-Mode

Interactive Test-UI starten:

```bash
npm run test:ui
```

## Umgebungsvariablen

### Erforderlich für E2E-Tests mit echten Providern

| Variable | Typ | Beschreibung | Beispiel |
|----------|-----|--------------|----------|
| `ZAI_API_KEY` | string | API Key für ZAI-Authentifizierung | `sk-...` |
| `ZAI_MODEL` | string | ZAI Modell-Name (Default: `glm-4.5`) | `glm-4.5-air` |
| `ZAI_VARIANT` | string | API-Variante: `paas` oder `coding` (Default: `paas`) | `coding` |
| `ZAI_BASE_URL` | string | Custom API-Endpunkt (Optional) | `https://api.z.ai/api/paas/v4/chat/completions` |

### Test-Konfiguration

| Variable | Typ | Beschreibung | Default |
|----------|-----|--------------|---------|
| `TEST_API_TIMEOUT` | number | Timeout für API-Anfragen in ms | `30000` (30s) |

### Beispiel-Konfigurationen

#### Standard-Konfiguration
```bash
ZAI_API_KEY=sk-your-api-key-here
ZAI_MODEL=glm-4.5
ZAI_VARIANT=paas
```

#### Coding-Variante
```bash
ZAI_API_KEY=sk-your-api-key-here
ZAI_MODEL=glm-4.5-air
ZAI_VARIANT=coding
ZAI_BASE_URL=https://api.z.ai/api/coding/paas/v4/chat/completions
```

#### Lange Timeouts für große Modelle
```bash
ZAI_API_KEY=sk-your-api-key-here
ZAI_MODEL=glm-4.5-x
TEST_API_TIMEOUT=120000
```

## Troubleshooting

### Problem: E2E-Tests werden übersprungen

**Symptom:**
```
Test Files  1 skipped (1)
Tests  6 skipped (6)
```

**Ursache:** Keine gültigen API-Credentials konfiguriert

**Lösung:**
1. Prüfen Sie, ob `.env` existiert und konfiguriert ist
2. Stellen Sie sicher, dass `ZAI_API_KEY` nicht `your-zai-api-key-here` ist
3. Validieren Sie mit `cat .env`

```bash
cat .env | grep ZAI_API_KEY
```

### Problem: Timeout während Tests

**Symptom:**
```
Error: Request timeout
```

**Ursache:** API-Anfrage dauert länger als konfigurierter Timeout

**Lösung:** Timeout erhöhen in `.env`

```bash
TEST_API_TIMEOUT=120000
```

### Problem: Ungültige API-Response

**Symptom:**
```
Error: Invalid response format from Z.ai API
```

**Ursache:** API-Response entspricht nicht erwartetem Schema

**Lösung:**
1. Prüfen Sie `ZAI_MODEL` - ist das Modell verfügbar?
2. Prüfen Sie `ZAI_BASE_URL` - ist der Endpunkt korrekt?
3. Überprüfen Sie Ihre API-Logs in der ZAI-Konsole

### Problem: Network Connection Error

**Symptom:**
```
Error: fetch failed
```

**Ursache:** Keine Internetverbindung oder Firewall blockiert API

**Lösung:**
1. Internetverbindung prüfen: `ping api.z.ai`
2. Firewall-Einstellungen prüfen
3. Proxy-Konfiguration falls nötig

### Problem: Tests schlagen fehl nach npm install

**Symptom:**
```
Error: Cannot find module 'vitest'
```

**Ursache:** Dependencies nicht korrekt installiert

**Lösung:**

```bash
rm -rf node_modules package-lock.json
npm install
```

### Problem: TypeScript-Compilation Errors

**Symptom:**
```
TS2307: Cannot find module '...'
```

**Ursache:** TypeScript-Konfiguration oder Imports falsch

**Lösung:**

```bash
npm run type-check
```

## Best Practices

### API-Testing

1. **Isolierte Test-Umgebung**: Nutzen Sie separate API-Keys für Testing
2. **Test-Fixtures**: Verwenden Sie konsistente Testdaten in `test/fixtures/`
3. **Error-Handling**: Testen Sie sowohl Happy Paths als auch Edge Cases
4. **Rate Limits**: Berücksichtigen Sie API-Rate-Limits in Test-Suites
5. **Idempotenz**: Tests sollten bei mehrfacher Ausführung gleiche Ergebnisse liefern

### Test-Organisation

1. **Mock-Tests für Unit-Testing**: Schnelle Tests für isolierte Komponenten
2. **E2E-Tests für Integration**: Verifizierung der Integration mit echten APIs
3. **Test-Timeouts**: Realistische Timeouts konfigurieren (30-120s)
4. **Test-Isolation**: Jeder Test sollte unabhängig von anderen Tests laufen

### Performance

1. **Test-Parallelisierung**: Vitest führt Tests parallel aus für schnellere Feedback-Schleifen
2. **Coverage-Thresholds**: Mindest-Coverage definieren und durchsetzen
3. **Test-Selektion**: Schnelle Tests häufiger ausführen als langsame E2E-Tests

### CI/CD Integration

1. **Separate Workflows**: Mock-Tests auf jeden Commit, E2E-Tests nur auf Pull Requests
2. **Secret Management**: API-Keys niemals in Code committen, nur als CI/CD Secrets
3. **Test-Reports**: Coverage-Reports in CI speichern und archivieren

## CI/CD Integration

### GitHub Actions Beispiel

`.github/workflows/test.yml`:

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  mock-tests:
    name: Mock Tests (No API Required)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Run mock tests
        run: npm test

  e2e-tests:
    name: E2E Tests with Real Provider
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Run E2E tests
        env:
          ZAI_API_KEY: ${{ secrets.ZAI_API_KEY }}
          ZAI_MODEL: ${{ secrets.ZAI_MODEL || 'glm-4.5' }}
          ZAI_VARIANT: ${{ secrets.ZAI_VARIANT || 'paas' }}
        run: npx vitest run test/e2e-real-provider.test.ts

  coverage:
    name: Coverage Report
    runs-on: ubuntu-latest
    needs: [mock-tests]
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Generate coverage
        run: npm run test:coverage
      - name: Upload coverage to Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
```

### GitLab CI Beispiel

`.gitlab-ci.yml`:

```yaml
stages:
  - test
  - e2e
  - coverage

mock-tests:
  stage: test
  image: node:20
  script:
    - npm ci
    - npm test

e2e-tests:
  stage: e2e
  image: node:20
  only:
    - merge_requests
  script:
    - npm ci
    - npx vitest run test/e2e-real-provider.test.ts
  variables:
    ZAI_API_KEY: $ZAI_API_KEY
    ZAI_MODEL: "glm-4.5"
    ZAI_VARIANT: "paas"

coverage:
  stage: coverage
  image: node:20
  needs: [mock-tests]
  script:
    - npm ci
    - npm run test:coverage
  artifacts:
    paths:
      - coverage/
    expire_in: 1 week
```

### Secrets konfigurieren

#### GitHub Actions
1. Repository Settings → Secrets and variables → Actions
2. New repository secret hinzufügen:
   - `ZAI_API_KEY`: Ihr ZAI API Key
   - `ZAI_MODEL`: Optional (Default: `glm-4.5`)
   - `ZAI_VARIANT`: Optional (Default: `paas`)

#### GitLab CI
1. Settings → CI/CD → Variables
2. Variable hinzufügen:
   - `ZAI_API_KEY`: Type: Variable, Protected: Optional
   - `ZAI_MODEL`: Optional
   - `ZAI_VARIANT`: Optional

## Provider-Specific Configs

### ZAI (z.ai)

**Standard-Konfiguration:**
```bash
ZAI_API_KEY=sk-your-api-key
ZAI_MODEL=glm-4.5
ZAI_VARIANT=paas
ZAI_BASE_URL=https://api.z.ai/api/paas/v4/chat/completions
```

**Verfügbare Modelle:**
- `glm-4.5`: Hauptmodell (Standard)
- `glm-4.5-air`: Leichtgewichtiges Modell
- `glm-4.5-x`: Fortgeschrittenes Modell
- `glm-4.5-airx`: Kompaktes fortgeschrittenes Modell
- `glm-4.5-flash`: Schnelles Modell

**Varianten:**
- `paas`: Standard PaaS API (Default)
- `coding`: Coding-Variante mit spezialisierten Modellen

**Rate Limits:**
- Prüfen Sie Ihre ZAI-Konsole für spezifische Limits
- Reduzieren Sie die Anzahl paralleler Test-Requests bei Rate-Limit-Fehlern

### Ollama (Lokal)

Für lokale Tests mit Ollama:

```bash
# Ollama lokal starten
ollama serve

# Modell herunterladen (falls nicht vorhanden)
ollama pull llama2

# Umgebungsvariablen
OLLAMA_BASE_URL=http://localhost:11434/api/generate
OLLAMA_MODEL=llama2
```

**Hinweis:** Ollama-Tests sind noch nicht implementiert, können aber mit ähnlicher Struktur wie ZAI-Tests hinzugefügt werden.

### OpenAI

**Konfiguration:**
```bash
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-4
OPENAI_BASE_URL=https://api.openai.com/v1/chat/completions
```

**Verfügbare Modelle:**
- `gpt-4`: Hauptmodell
- `gpt-4-turbo`: Schnellere Variante
- `gpt-3.5-turbo`: Kosteneffiziente Option

### Claude

**Konfiguration:**
```bash
CLAUDE_API_KEY=sk-your-claude-api-key
CLAUDE_MODEL=claude-3-opus-20240229
CLAUDE_BASE_URL=https://api.anthropic.com/v1/messages
```

### Gemini

**Konfiguration:**
```bash
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-pro
```

## Test-Struktur

### Mock-Tests (`test/e2e.test.ts`)

- **Happy Path Tests**: Standard-Szenarien mit erwarteten Responses
- **Multiple Tags**: Tests mit mehreren Tags pro Email
- **Edge Cases**: Leere Bodies, malformed data
- **Error Handling**: Timeouts, Server Errors, Invalid JSON
- **Email Structure Validation**: Header-Parsing, Attachment-Extraction

### E2E-Real-Provider-Tests (`test/e2e-real-provider.test.ts`)

- **Business Email Tagging**: `is_business` Tag für geschäftliche E-Mails
- **Advertisement Email Tagging**: `is_advertise` Tag für Werbe-E-Mails
- **Personal Email Tagging**: `is_personal` Tag für persönliche E-Mails
- **Multiple Tags Handling**: Korrekte Verarbeitung mehrerer Tags
- **Empty Email Handling**: Graceful Handling leerer E-Mails
- **Response Structure Validation**: Validierung der Response-Struktur

### Test-Helper (`test/test-helpers.ts`)

Utility-Funktionen für Tests:
- `createTestProvider()`: Erzeugt MockProvider-Instanz
- `runTaggingTest()`: Führt standardisierten Tagging-Test aus
- `expectValidResponse()`: Validiert Response-Struktur
- `MOCK_SETTINGS`: Standard Mock-Konfiguration

### Test-Config (`test/test-config.ts`)

Konfiguration für Tests:
- `getTestConfig()`: Lädt Konfiguration aus Umgebungsvariablen
- `hasValidZaiConfig()`: Prüft auf gültige ZAI-Konfiguration
- `TEST_TIMEOUT`: Standard-Timeout für API-Tests (30s)

## Nützliche Befehle

```bash
# Alle Tests ausführen
npm test

# Tests im Watch-Mode
npm run test:watch

# Tests mit UI
npm run test:ui

# Coverage generieren
npm run test:coverage

# Nur Mock-Tests
npx vitest run test/e2e.test.ts

# Nur E2E-Tests mit echtem Provider
npx vitest run test/e2e-real-provider.test.ts

# Nur einen spezifischen Test
npx vitest run -t "should tag business email"

# Type-Check
npm run type-check

# Lint
npm run lint

# Lint mit Auto-Fix
npm run lint:fix
```

## Weiterführende Ressourcen

- [Vitest Dokumentation](https://vitest.dev/)
- [TypeScript Testing Guide](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [ZAI API Dokumentation](https://docs.z.ai/)
- [Testing Best Practices](https://testingjavascript.com/)

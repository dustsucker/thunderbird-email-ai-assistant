# Specification: Fix Provider Setup with Dynamic Settings

## Overview

The provider settings UI in the Thunderbird Email AI Assistant options page is broken due to two critical issues: (1) HTML element ID mismatches between `options.html` and `SettingsForm.ts`, and (2) orphan HTML elements that are not contained within any provider settings div. This task will fix these issues to ensure each provider's settings are correctly displayed and saved when the user selects that provider.

## Workflow Type

**Type**: feature

**Rationale**: This task involves fixing broken functionality and ensuring the provider settings UI works correctly. While it could be classified as a bug fix, the requirement to make settings "dynamic so that every provider has different settings" indicates a feature enhancement to ensure provider-specific configuration.

## Task Scope

### Services Involved
- **main** (primary) - Single TypeScript/Webpack project containing the Thunderbird extension

### This Task Will:
- [ ] Fix HTML element ID mismatches between `options.html` and `SettingsForm.ts`
- [ ] Remove orphan HTML elements (zai-model, zai-variant) that are outside provider settings divs
- [ ] Ensure each provider's settings div is properly structured and hidden by default
- [ ] Verify the `showRelevantSettings()` function correctly shows/hides provider-specific settings
- [ ] Test that provider settings are correctly loaded and saved

### Out of Scope:
- Adding new providers
- Changing the provider configuration schema
- Modifying the underlying provider implementations
- Adding new settings fields for existing providers

## Service Context

### Main Service

**Tech Stack:**
- Language: TypeScript
- Framework: Thunderbird WebExtension (manifest v2)
- Build Tool: Webpack
- DI Container: tsyringe
- Key directories: `src/` (source), `test/` (tests)

**Entry Point:** `src/interfaces/options/OptionsScript.ts`

**How to Run:**
```bash
npm install
npm run build
# Load extension in Thunderbird via about:debugging
```

**Port:** N/A (Thunderbird extension)

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `options.html` | main | Fix Zai PaaS/Coding element IDs to match SettingsForm.ts expectations; remove orphan elements (lines 199-219) |
| `src/interfaces/options/SettingsForm.ts` | main | Verify element ID lookups match HTML; potentially update getDOMElements() if needed |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `src/interfaces/options/SettingsForm.ts` | Provider settings loading/saving pattern, DOM element lookup pattern |
| `src/shared/types/ProviderTypes.ts` | Provider enum definition, provider configuration interface |
| `src/infrastructure/interfaces/IProvider.ts` | Provider settings interface |

## Patterns to Follow

### Provider Settings DOM Structure

From `options.html` (existing working providers):

```html
<!-- Provider Settings Pattern -->
<div id="[provider-id]-settings" class="provider-settings" style="display: none">
  <div class="form-group">
    <label for="[provider-id]-api-key">[Provider] API Key:</label>
    <input type="password" id="[provider-id]-api-key" name="[provider-id]-api-key" />
  </div>
  <div class="help-section">
    <p><b>Privacy Notice:</b> ...</p>
  </div>
</div>
```

**Key Points:**
- Settings div ID format: `[provider-id]-settings` (e.g., `openai-settings`, `zai-paas-settings`)
- Input/select ID format: `[provider-id]-[field-name]` using kebab-case (e.g., `zai-paas-api-key`)
- All provider settings divs use `style="display: none"` except the default (ollama)
- Each div has `class="provider-settings"` for the show/hide logic

### Element ID Mapping

From `SettingsForm.ts` getDOMElements():

```typescript
// Element lookup pattern - IDs must be kebab-case
const zaiPaasApiKey = document.getElementById('zai-paas-api-key') as HTMLInputElement;
const zaiPaasModel = document.getElementById('zai-paas-model') as HTMLSelectElement;
const zaiPaasBaseUrl = document.getElementById('zai-paas-base-url') as HTMLInputElement;
const zaiCodingApiKey = document.getElementById('zai-coding-api-key') as HTMLInputElement;
const zaiCodingModel = document.getElementById('zai-coding-model') as HTMLSelectElement;
const zaiCodingBaseUrl = document.getElementById('zai-coding-base-url') as HTMLInputElement;
```

**Key Points:**
- All element IDs in HTML must match exactly what SettingsForm.ts looks for
- Use kebab-case (e.g., `zai-paas-api-key` NOT `zaiPaasApiKey`)
- SettingsForm.ts stores references in the `elements` object

## Requirements

### Functional Requirements

1. **Fix Zai PaaS Settings Element IDs**
   - Description: Update `options.html` Zai PaaS settings div to use correct kebab-case IDs
   - Acceptance: `SettingsForm.ts` can successfully find and bind to all Zai PaaS form elements

2. **Fix Zai Coding Settings Element IDs**
   - Description: Update `options.html` Zai Coding settings div to use correct kebab-case IDs
   - Acceptance: `SettingsForm.ts` can successfully find and bind to all Zai Coding form elements

3. **Remove Orphan HTML Elements**
   - Description: Remove orphan `zai-model`, `zai-variant` elements and associated help text (lines ~199-219)
   - Acceptance: No form elements exist outside provider settings divs

4. **Dynamic Provider Settings Display**
   - Description: When user selects a provider, only that provider's settings should be visible
   - Acceptance: Selecting each provider shows only its relevant settings fields

### Edge Cases

1. **First-time load** - Default provider (openai) settings should display correctly
2. **Provider switch** - Previous provider settings should hide, new should show
3. **Missing settings** - If settings don't exist for a provider, form should still work with empty/default values
4. **Save with no changes** - Saving should work even if no changes were made

## Implementation Notes

### DO
- Follow the existing kebab-case ID naming convention for HTML elements
- Keep the `provider-settings` class on all provider settings divs
- Maintain `style="display: none"` on all provider divs except the first (ollama)
- Test loading settings after switching providers to ensure persistence works

### DON'T
- Change the SettingsForm.ts element lookup logic - fix the HTML to match instead
- Remove or modify the privacy notices in provider settings
- Change the provider enum values or configuration schema
- Modify how settings are persisted to storage

## Current Issue Details

### Issue 1: Element ID Mismatch (Zai PaaS)

**Current (options.html lines 161-178):**
```html
<input type="password" id="zaiPaasApiKey" name="zaiPaasApiKey">
<select id="zaiPaasModel" name="zaiPaasModel"></select>
<input type="text" id="zaiPaasBaseUrl" name="zaiPaasBaseUrl">
```

**Expected (per SettingsForm.ts):**
```html
<input type="password" id="zai-paas-api-key" name="zai-paas-api-key">
<select id="zai-paas-model" name="zai-paas-model"></select>
<input type="text" id="zai-paas-base-url" name="zai-paas-base-url">
```

### Issue 2: Element ID Mismatch (Zai Coding)

**Current (options.html lines 181-198):**
```html
<input type="password" id="zaiCodingApiKey" name="zaiCodingApiKey">
<select id="zaiCodingModel" name="zaiCodingModel"></select>
<input type="text" id="zaiCodingBaseUrl" name="zaiCodingBaseUrl">
```

**Expected (per SettingsForm.ts):**
```html
<input type="password" id="zai-coding-api-key" name="zai-coding-api-key">
<select id="zai-coding-model" name="zai-coding-model"></select>
<input type="text" id="zai-coding-base-url" name="zai-coding-base-url">
```

### Issue 3: Orphan HTML Elements

**Remove (options.html lines ~199-219):**
```html
<!-- These are outside any provider-settings div -->
<div class="form-group">
  <label for="zai-model">Model:</label>
  <select id="zai-model" name="zai-model">
    <!-- Wird dynamisch befüllt -->
  </select>
</div>
<div class="form-group">
  <label for="zai-variant">Variant:</label>
  <select id="zai-variant" name="zai-variant">
    <option value="paas">PaaS (Pay-per-use)</option>
    <option value="coding">Coding Plan (Subscription)</option>
  </select>
</div>
<div class="help-section">
  ...
</div>
```

These elements appear to be leftover from an older unified Zai provider implementation before it was split into zai-paas and zai-coding.

## Development Environment

### Start Services

```bash
# Install dependencies
npm install

# Build the extension
npm run build

# Run tests
npm test

# Watch mode for development
npm run watch
```

### Service URLs
- N/A - This is a Thunderbird extension, not a web service

### Required Environment Variables
- None required for development
- Production requires API keys for respective providers (stored in extension settings)

## Success Criteria

The task is complete when:

1. [ ] Zai PaaS settings load and save correctly when selected as provider
2. [ ] Zai Coding settings load and save correctly when selected as provider
3. [ ] All provider settings display only when their provider is selected
4. [ ] No orphan HTML elements exist outside provider settings divs
5. [ ] No console errors when loading or switching providers
6. [ ] Existing tests still pass
7. [ ] Settings persist correctly after browser/extension restart

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| SettingsForm render | `test/unit/SettingsForm.test.ts` (if exists) | Form renders without errors |
| Provider settings validation | `test/unit/SettingsForm.test.ts` | Validation works for all providers |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| Settings persistence | SettingsForm ↔ ConfigRepository | Settings save and load correctly |
| Provider switching | SettingsForm ↔ DOM | Correct settings divs show/hide |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Configure Zai PaaS | 1. Open options 2. Select zai-paas 3. Enter API key 4. Save | Settings saved, reloads correctly |
| Configure Zai Coding | 1. Open options 2. Select zai-coding 3. Enter API key 4. Save | Settings saved, reloads correctly |
| Provider switching | 1. Select openai 2. Select zai-paas 3. Select claude | Only selected provider settings visible |

### Browser Verification (if frontend)
| Page/Component | URL | Checks |
|----------------|-----|--------|
| Options page | `about:addons > Extension > Preferences` | No orphan elements visible, provider switching works |
| Zai PaaS settings | Options page with zai-paas selected | API key, model, base URL fields present and functional |
| Zai Coding settings | Options page with zai-coding selected | API key, model, base URL fields present and functional |

### Database Verification (if applicable)
| Check | Query/Command | Expected |
|-------|---------------|----------|
| Settings storage | Browser dev tools > Storage > Local Storage | Provider settings saved with correct structure |

### QA Sign-off Requirements
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Browser verification complete (if applicable)
- [ ] Database state verified (if applicable)
- [ ] No regressions in existing functionality
- [ ] Code follows established patterns
- [ ] No security vulnerabilities introduced

## Provider Reference

For reference, here are all providers and their required settings:

| Provider | Settings Required |
|----------|------------------|
| ollama | API URL, Model |
| openai | API Key |
| gemini | API Key |
| claude | API Key |
| mistral | API Key |
| deepseek | API Key |
| zai-paas | API Key, Model, Base URL (optional) |
| zai-coding | API Key, Model, Base URL (optional) |

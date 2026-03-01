# ADR-0006: Manifest V3 Hybrid Approach

## Status

Accepted

## Context

Thunderbird extensions use the WebExtensions API, which is transitioning from Manifest V2 to V3. However, Thunderbird's implementation has specific challenges:

### Current Situation

1. **Thunderbird's Manifest V3 support** is still maturing
2. **Persistent background pages** are deprecated in V3 but required for some Thunderbird APIs
3. **Service Workers** (the V3 replacement) have limitations in Thunderbird
4. **There is a known bug** in Thunderbird that blocks full V3 migration

### Thunderbird-Specific Constraints

- `browser.messages` API works best with persistent background
- Event listeners need stable context for reliable email monitoring
- Some APIs don't work correctly with non-persistent contexts

## Decision

We adopt a **Hybrid Manifest V3 Approach**:

1. **Manifest version**: Set to V3 (`"manifest_version": 3`)
2. **Background page**: Persistent HTML page (not Service Worker)
3. **CSP**: Manifest V3 compliant Content Security Policy

### Current Configuration

```json
{
  "manifest_version": 3,
  "background": {
    "page": "background.html",
    "persistent": true
  },
  "content_security_policy": {
    "extension_pages": "default-src 'self'; script-src 'self'; object-src 'none'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*"
  }
}
```

### Migration Path

```
┌─────────────────────────────────────────────────────────────┐
│                    Future Migration                          │
│                                                              │
│  Current (Hybrid V3)    →    Full V3 (When Thunderbird Ready) │
│  - persistent: true          - Service Worker                 │
│  - HTML background           - JavaScript background          │
│  - Full API access           - Event-based wake               │
└─────────────────────────────────────────────────────────────┘
```

### Why Not Full V3 Now?

| Feature | V3 Standard | Thunderbird Status |
|---------|-------------|-------------------|
| Service Workers | Required | Partial support, bugs |
| Persistent Pages | Deprecated | Still works, reliable |
| `browser.messages` API | Works | Works better with persistent |
| Event persistence | Stateless | Requires stateful context |

### Blocking Issues

1. **Thunderbird Bug**: Known issue with Service Worker lifecycle
2. **API Timing**: Some APIs need immediate response, not wake-up delay
3. **State Management**: Email analysis queue needs persistent state

## Consequences

### Positive

- **Works now**: Extension functions reliably with current Thunderbird
- **V3 declared**: Already using V3 manifest version
- **Clear migration path**: Known steps to full V3 when ready
- **Stable APIs**: Persistent page ensures reliable event handling
- **Backward compatible**: Works with current Thunderbird versions

### Negative

- **Not fully V3 compliant**: Uses deprecated persistent background
- **Resource usage**: Background page always in memory
- **Future migration needed**: Will need changes when Thunderbird V3 matures
- **Technical debt**: Temporary workaround, not final architecture

### Mitigations

- **Monitor Thunderbird releases**: Track V3 Service Worker improvements
- **Document migration steps**: Clear plan for future transition
- **Isolate background logic**: Keep code ready for Service Worker migration
- **Test regularly**: Verify behavior on new Thunderbird versions

### Migration Checklist (Future)

When Thunderbird V3 is ready:

- [ ] Change `background.page` to `background.service_worker`
- [ ] Remove `persistent: true`
- [ ] Implement state persistence (IndexedDB/localStorage)
- [ ] Update event listeners for Service Worker lifecycle
- [ ] Test wake-from-idle behavior
- [ ] Update CSP if needed

## References

### Key Files

- `manifest.json` - Extension manifest with V3 configuration
- `background.html` - Persistent background page
- `src/background/index.ts` - Background script entry point
- `src/background/BackgroundScript.ts` - Main background logic

### Related ADRs

- [ADR-0002: Hexagonal Architecture](0002-hexagonal-architecture-with-di.md)

### External References

- [Thunderbird WebExtensions](https://webextension-api.thunderbird.net/en/latest/)
- [MDN - Manifest V3](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/manifest_version)
- [Chrome - MV3 Migration](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Thunderbird Bug Tracker](https://bugzilla.mozilla.org/) (search for Service Worker issues)

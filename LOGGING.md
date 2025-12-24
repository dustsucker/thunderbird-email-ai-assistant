# Logging Strategy Documentation

## Overview

This document describes the improved logging strategy for the Thunderbird Email AI Assistant. The implementation provides consistent error handling, structured logging, and user-facing error notifications.

## Architecture

### Error Types (ErrorType enum)

| Type | Description | Example Scenarios |
|------|-------------|-------------------|
| `API` | API call failures | Timeout, rate limits, invalid responses |
| `PROVIDER` | Provider-specific errors | OpenAI/Claude/Mistral errors |
| `USER` | User configuration/validation | Missing API keys, invalid inputs |
| `SYSTEM` | System-level errors | Storage failures, permissions |
| `NETWORK` | Network connectivity issues | Connection failures |
| `VALIDATION` | Input validation errors | Invalid tag formats, malformed data |

### Error Severity Levels (ErrorSeverity enum)

| Severity | Display Type | Auto-Hide | Use Cases |
|----------|--------------|------------|-----------|
| `CRITICAL` | Alert/Dialog | No | Configuration errors, permission issues, system failures |
| `WARNING` | Toast/Notification | Yes (5s) | Network errors, API timeouts, rate limits |
| `INFO` | Status message | Yes (5s) | Validation errors, informational messages |

### Core Functions

#### `logAndDisplayError(error, type, context, customMessage)`

Main error handling function used throughout the application.

**Parameters:**
- `error: unknown` - The error object (Error, string, or unknown)
- `type: ErrorType` - Categorization for the error
- `context: LoggerContext` - Additional metadata (provider, action, etc.)
- `customMessage?: string` - Optional override message

**Behavior:**
1. Extracts error message
2. Determines severity based on type and content
3. Logs error with full context (including stack trace for Error objects)
4. Sends error to UI via runtime message

**Usage Example:**
```typescript
try {
  await provider.analyze(data);
} catch (error) {
  logAndDisplayError(error, ErrorType.PROVIDER, {
    provider: 'openai',
    action: 'analyze_email',
  });
}
```

### Info Logging Standards

The following events are logged at `INFO` level:

| Event | Context Logged |
|-------|---------------|
| Background script loaded | - |
| Batch analysis started | totalMessages, timestamp |
| Messages collected | folderId or 'all folders', count |
| Messages filtered | total, filteredOut, remaining |
| Batch processing started | total, count |
| Each batch loaded | batch range, loaded/total |
| Each batch analyzed | batch range |
| API call started | provider, priority |
| API call completed | provider, tagsFound, confidence |
| Message tagged | messageId, tagSet |
| Batch progress | processed/total, successful, failed |
| Batch completed | total, successful, failed |
| New mail event received | messageCount, folder info |
| Context menu action | folderId, folderName, folderPath |

### Error Display Mechanism

#### Background Script → UI Communication

1. **Background Script (`background.ts`)**
   - Uses `logAndDisplayError()` to handle errors
   - Sends `{ action: 'showError', error: ErrorDisplay }` via `browser.runtime.sendMessage()`
   - Handles "Receiving end does not exist" gracefully (options page not open)

2. **Options Page (`options.ts`)**
   - Listens for `showError` runtime messages
   - Creates overlay UI with severity-based styling
   - Auto-hides non-critical errors after 5 seconds

#### UI Components

**Error Overlay (`options.css`):**
- Fixed position overlay with semi-transparent background
- Animated slide-in effect
- Color-coded by severity:
  - CRITICAL: Red border (#d32f2f), light red background (#ffebee), 🚨 icon
  - WARNING: Orange border (#ff9800), light orange background (#fff3e0), ⚠️ icon
  - INFO: Blue border (#2196f3), light blue background (#e3f2fd), ℹ️ icon
- Close button for manual dismissal
- Details section showing context object

### Runtime Message Types

Extended runtime message system includes:

```typescript
type RuntimeMessage =
  | StartBatchAnalysisMessage
  | GetBatchProgressMessage
  | CancelBatchAnalysisMessage
  | ShowErrorRuntimeMessage;  // NEW
```

### Integration Points

#### In `background.ts`

All error handling points updated to use `logAndDisplayError()`:

1. `analyzeEmail()` - Provider errors
2. `analyzeMessagesBatch()` - Message loading failures
3. `startBatchAnalysis()` - Collection errors
4. `registerFolderContextMenu()` - Menu creation errors
5. `onNewMailReceived` handler - New mail processing errors
6. `handleRuntimeMessage()` - Runtime message errors

#### In `options.ts`

Added error display functionality:

1. `setupRuntimeMessageListener()` - Listens for background errors
2. `showError()` - Creates and displays error overlay
3. `ensureErrorDisplay()` - Lazily creates error DOM elements

### Files Modified

| File | Changes |
|------|----------|
| `providers/utils.ts` | Added `logAndDisplayError()`, `ErrorSeverity`, `ErrorType`, `ShowErrorRuntimeMessage` |
| `background.ts` | Updated all error handling to use `logAndDisplayError()`, added info logging throughout |
| `options.ts` | Added error display listener and UI functions |
| `options.css` | Added error overlay styling |

### Best Practices

1. **Always use `logAndDisplayError()`** for error handling - don't use `logger.error()` directly
2. **Include relevant context** - provider, action, messageId, etc.
3. **Choose appropriate error type** - helps categorize issues
4. **Custom messages for user errors** - provide helpful, actionable messages
5. **Let severity auto-detect** - the function determines severity based on type and content

### Testing Checklist

- [ ] Errors appear in console with full context
- [ ] Critical errors show as red overlays that persist
- [ ] Warning errors show as orange overlays that auto-hide
- [ ] Info errors show as blue overlays that auto-hide
- [ ] All major code paths have error handling
- [ ] Batch analysis logs show proper progress
- [ ] API calls show start/completion logging
- [ ] Filtered messages are logged
- [ ] Context menu actions are logged

### Example Log Output

```
[2025-12-24T10:30:00.000Z] [INFO] Starting email analysis {provider: "openai", priority: 1, bodyLength: 1234, attachmentCount: 0}
[2025-12-24T10:30:00.100Z] [INFO] API call started {provider: "openai", priority: 1}
[2025-12-24T10:30:01.500Z] [INFO] API call completed successfully {provider: "openai", tagsFound: 3, confidence: 0.85}
[2025-12-24T10:30:02.000Z] [INFO] Message tagged successfully {messageId: 12345, tagSet: ["#tagged", "#work", "#urgent"]}
[2025-12-24T10:30:03.000Z] [INFO] Batch progress: 5/10 messages processed {successful: 4, failed: 1}
[2025-12-24T10:30:04.000Z] [ERROR] [PROVIDER] API request timeout {provider: "openai", priority: 2, action: "email_analysis", severity: "warning"}
```

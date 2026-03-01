# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Thunderbird Email AI Assistant project.

## What is an ADR?

An ADR is a document that captures an important architectural decision made along with its context and consequences. ADRs help teams:

- Understand **why** decisions were made
- Track the **evolution** of the architecture
- Onboard new developers **faster**
- Avoid **repeating** past discussions

## ADR Index

| Number | Title | Status | Date |
|--------|-------|--------|------|
| [0001](0001-record-architecture-decisions.md) | Record Architecture Decisions | Accepted | 2025-03-01 |
| [0002](0002-hexagonal-architecture-with-di.md) | Hexagonal Architecture with Dependency Injection | Accepted | 2025-03-01 |
| [0003](0003-multi-provider-strategy.md) | Multi-Provider LLM Strategy | Accepted | 2025-03-01 |
| [0004](0004-event-driven-domain-events.md) | Event-Driven Domain Events | Accepted | 2025-03-01 |
| [0005](0005-value-objects-validation.md) | Value Objects with Validation | Accepted | 2025-03-01 |
| [0006](0006-manifest-v3-hybrid-approach.md) | Manifest V3 Hybrid Approach | Accepted | 2025-03-01 |

## Creating a New ADR

1. Copy the template below to a new file: `NNNN-short-title.md`
2. Fill in all sections
3. Submit for review

### ADR Template

```markdown
# ADR-NNNN: Title

## Status

[Proposed | Accepted | Deprecated | Superseded by ADR-XXXX]

## Context

What is the issue that we're seeing that is motivating this decision?

## Decision

What is the change that we're proposing/have made?

## Consequences

What becomes easier or more difficult because of this change?

## References

- Link to relevant code files
- Link to related ADRs
```

## Architecture Overview

```
┌─────────────────────────────────────────┐
│           Interfaces (Entry)            │  ← background.ts, options.ts
├─────────────────────────────────────────┤
│          Application (Use Cases)        │  ← AnalyzeEmail, ApplyTags
├─────────────────────────────────────────┤
│            Domain (Business)            │  ← Email, Tag, Events
├─────────────────────────────────────────┤
│        Infrastructure (External)        │  ← Providers, Cache, DB
└─────────────────────────────────────────┘
           Shared (Cross-cutting)          ← Types, Utils
```

**Dependency Flow:** Interfaces → Application → Domain ← Infrastructure

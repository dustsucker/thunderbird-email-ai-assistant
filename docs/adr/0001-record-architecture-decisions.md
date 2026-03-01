# ADR-0001: Record Architecture Decisions

## Status

Accepted

## Context

The Thunderbird Email AI Assistant project is a complex MailExtension that integrates multiple LLM providers for email classification. As the codebase grows and the team evolves, we need a way to:

1. **Document why** architectural decisions were made
2. **Track the evolution** of the system over time
3. **Onboard new developers** quickly
4. **Avoid re-litigating** past decisions
5. **Understand trade-offs** when considering changes

Without formal documentation, architectural knowledge remains in:
-分散した会話 (scattered conversations)
- Commit messages (often incomplete)
- Individual team members' heads (lost when they leave)

## Decision

We will use Architecture Decision Records (ADRs) to document all significant architectural decisions.

### ADR Format

Each ADR follows the standard format:

1. **Title**: Short noun phrase describing the decision
2. **Status**: Proposed, Accepted, Deprecated, or Superseded
3. **Context**: The issue motivating this decision
4. **Decision**: The change being proposed or made
5. **Consequences**: What becomes easier or harder
6. **References**: Links to code and related ADRs

### ADR Naming Convention

- Files are numbered sequentially: `0001-title.md`, `0002-title.md`
- Use lowercase with hyphens: `multi-provider-strategy.md`
- Keep titles short but descriptive

### When to Create an ADR

Create an ADR when:

- Choosing between multiple technologies or patterns
- Making a decision that affects the system structure
- Establishing coding conventions or standards
- Changing a previous architectural decision

### When NOT to Create an ADR

- Small refactoring changes
- Bug fixes
- Feature additions that don't affect architecture
- Implementation details that don't affect other components

## Consequences

### Positive

- **Knowledge preservation**: Decisions are documented for future reference
- **Faster onboarding**: New developers can understand the "why" behind the code
- **Better decisions**: Forces thinking through trade-offs before committing
- **Reduced bikeshedding**: Past decisions don't need to be re-argued

### Negative

- **Maintenance overhead**: ADRs need to be kept up to date
- **Documentation burden**: Takes time to write good ADRs
- **Risk of staleness**: ADRs can become outdated if not maintained

### Mitigations

- Review ADRs quarterly for accuracy
- Mark outdated ADRs as "Deprecated" rather than deleting
- Keep ADRs focused and concise

## References

- [Michael Nygard's ADR blog post](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [GitHub's ADR template](https://github.com/github/markdown/blob/master/docs/adr-template.md)
- [ADR GitHub Organization](https://adr.github.io/)

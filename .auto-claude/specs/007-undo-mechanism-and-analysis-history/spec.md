# Undo Mechanism and Analysis History

Allow users to undo recent tag applications and view a history/audit log of all AI classifications. History includes timestamp, email subject, applied tags, confidence scores, and provider used.

## Rationale
Addresses known gap for undo mechanism and audit log. Users need to correct AI mistakes easily and review past classifications. This builds trust and enables users to refine their prompts based on historical performance.

## User Stories
- As a user, I want to undo incorrect tag applications so that I can easily correct AI mistakes
- As a power user, I want to review analysis history so that I can evaluate how well my prompts are working

## Acceptance Criteria
- [ ] Undo button in notification after tags are applied
- [ ] Undo option in message context menu for recently tagged messages
- [ ] Analysis history page showing last 1000 classifications
- [ ] History entries include: timestamp, email subject, tags, confidence, provider
- [ ] Filter history by date range, tag, or confidence level
- [ ] Export history as CSV for analysis
- [ ] History stored locally with configurable retention period

# Tag Suggestion Preview Before Application

Show proposed tags to users before applying them, with option to approve, reject, or modify. Supports both individual email preview and batch preview mode.

## Rationale
Users want control over what tags are applied. Preview mode builds trust in the AI system and prevents unwanted tagging. This is especially important for new users learning how their prompts work.

## User Stories
- As a new user, I want to preview tag suggestions so that I can verify my prompts are working correctly before auto-applying
- As a careful user, I want to approve tags before they're applied so that I maintain control over my email organization

## Acceptance Criteria
- [ ] Preview mode toggle in settings (preview all / auto-apply above threshold)
- [ ] Preview UI shows email subject, proposed tags, and confidence scores
- [ ] Users can approve, reject, or modify suggested tags
- [ ] Batch preview shows list of emails with proposed tags
- [ ] Quick approve/reject all buttons for batch operations
- [ ] User modifications inform learning system (if enabled)

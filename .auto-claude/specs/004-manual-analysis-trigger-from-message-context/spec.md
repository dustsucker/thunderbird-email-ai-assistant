# Manual Analysis Trigger from Message Context

Add a right-click context menu option and keyboard shortcut to manually trigger AI analysis on selected email(s). Users can analyze specific messages on-demand without waiting for automatic processing.

## Rationale
Users need control over when analysis happens. Addresses the gap where users can't analyze emails that arrived before extension installation or re-analyze with updated prompts. Competitors like manual Thunderbird filters require tedious rule creation (pain-4-1) - this provides an intelligent alternative.

## User Stories
- As an email power user, I want to manually trigger AI analysis on specific emails so that I can organize messages that arrived before I configured my tags
- As a privacy-conscious user, I want to analyze only selected emails so that I control exactly which messages are processed by AI

## Acceptance Criteria
- [ ] Right-click context menu shows 'Analyze with AI' option on selected messages
- [ ] Keyboard shortcut (configurable) triggers analysis on selected messages
- [ ] Multiple message selection is supported for batch manual analysis
- [ ] Progress indicator shows analysis status
- [ ] Results are applied immediately after analysis completes

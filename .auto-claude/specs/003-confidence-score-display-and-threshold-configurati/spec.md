# Confidence Score Display and Threshold Configuration

Display confidence scores for AI classifications and allow users to configure minimum confidence thresholds. Tags are only applied when confidence exceeds the threshold.

## Rationale
Addresses market gap-5: lack of transparency in AI decisions. Gmail and SaneBox don't explain why emails are categorized (pain-3-3). Users need to understand AI certainty and control when tags are applied to avoid incorrect classifications.

## User Stories
- As a cautious user, I want to see confidence scores so that I can understand how certain the AI is about its classifications
- As a power user, I want to set minimum confidence thresholds so that only high-confidence tags are applied automatically

## Acceptance Criteria
- [ ] Confidence score (0-100%) is displayed alongside each tag suggestion
- [ ] Global confidence threshold setting in options (default: 70%)
- [ ] Per-tag confidence threshold override option
- [ ] Low-confidence classifications are flagged for manual review
- [ ] Confidence scores are stored with analysis history

# Confidence Thresholds Feature Guide

## Overview

The Confidence Thresholds feature provides transparency and control over AI-powered email classification. It displays confidence scores for each tag suggestion and allows you to configure minimum confidence thresholds, ensuring tags are only applied when the AI is sufficiently certain.

### Key Benefits

- **Transparency**: See how confident the AI is about each classification
- **Control**: Set thresholds to prevent incorrect automatic tag applications
- **Flexibility**: Use global thresholds or override per-tag for fine-grained control
- **Safety Net**: Review borderline cases manually before applying tags

## Understanding Confidence Scores

### What are Confidence Scores?

Confidence scores represent the AI model's certainty level about its classification, expressed as a percentage (0-100%).

- **100%**: Completely certain
- **70-99%**: Highly confident
- **50-69%**: Moderately confident
- **Below 50%**: Low confidence - likely uncertain

### How Confidence Scores are Calculated

The AI model analyzes your email content and assigns a confidence score based on:

1. **Pattern matching**: How well the email matches the tag's criteria
2. **Context clarity**: Whether the email content is clear and unambiguous
3. **Training similarity**: How similar the email is to examples the model was trained on

> **Note**: Confidence scores may vary across different AI providers and models. Some models are inherently more conservative in their confidence estimates.

### Visual Indicators

The extension uses color-coded badges to quickly indicate confidence levels:

| Confidence Level | Percentage | Color | Meaning |
|-----------------|------------|-------|---------|
| High | 80% - 100% | 🟢 Green | AI is very confident - tag can be safely applied |
| Medium | 70% - 79% | 🟡 Yellow | AI is moderately confident - generally reliable |
| Low | 0% - 69% | 🔴 Red | AI is uncertain - manual review recommended |

## Configuring Confidence Thresholds

### Accessing Confidence Settings

1. Go to `Tools > Add-ons and Themes` in Thunderbird
2. Find "Mail Assistant" and click the "..." button
3. Select **Options**
4. Navigate to the **General Settings** (Allgemeine Einstellungen) tab

![Confidence Threshold Settings](/doc/screenshots/settings-confidence.png)
_Confidence threshold configuration in provider settings_

### Setting a Global Confidence Threshold

The global threshold applies to all tags unless overridden individually.

**To set the global threshold:**

1. In the General Settings tab, locate the "Confidence Threshold" section
2. Use the slider or number input to set your desired threshold (0-100%)
3. The default is **70%**, which works well for most use cases
4. Changes are saved automatically

**Recommended Thresholds:**

| Use Case | Recommended Threshold | Rationale |
|----------|----------------------|-----------|
| General use | 70% | Balances accuracy and coverage |
| High accuracy needed | 80-85% | Minimizes false positives |
| Maximum coverage | 50-60% | Catches more potential matches, review recommended |

### Setting Per-Tag Thresholds

Override the global threshold for specific tags based on their importance.

**To set a per-tag threshold:**

1. Go to the **Custom Tags** tab
2. Click **Edit** next to the tag you want to configure
3. Find the "Override confidence threshold" field
4. Enter a value between 0-100, or leave empty to use the global threshold
5. Click **Save**

**Example Per-Tag Configurations:**

| Tag Name | Threshold | Reasoning |
|----------|-----------|-----------|
| Urgent | 85% | High confidence needed to avoid false alarms |
| Newsletter | 60% | Lower threshold okay - less critical if misclassified |
| Invoice | 80% | Important for financial tracking |
| Spam | 75% | Balance between catching spam and avoiding false positives |

### Viewing Thresholds in the Tag List

The Custom Tags tab shows each tag's threshold setting:

- **Custom threshold shown in blue**: `Threshold: 85%`
- **Global threshold shown in gray**: `Threshold: Global (70%)`

This makes it easy to see which tags have custom thresholds at a glance.

## How Thresholds Affect Tag Application

### Automatic Tag Application

When an email is analyzed:

1. AI suggests tags with confidence scores
2. For each suggested tag, the system checks:
   - Is confidence >= tag's threshold?
   - If YES: Tag is automatically applied to the email
   - If NO: Tag is NOT applied, but flagged for manual review

### Example Scenarios

**Scenario 1: Tag Applied Automatically**

```
Global Threshold: 70%
Tag: "Invoice" (no override, uses 70%)
AI Confidence: 82%
Result: ✅ Tag applied (82% >= 70%)
```

**Scenario 2: Tag Below Global Threshold**

```
Global Threshold: 70%
Tag: "Invoice" (no override, uses 70%)
AI Confidence: 55%
Result: ❌ Tag NOT applied, flagged for manual review (55% < 70%)
```

**Scenario 3: Per-Tag Override Applied**

```
Global Threshold: 70%
Tag: "Urgent" (override: 85%)
AI Confidence: 78%
Result: ❌ Tag NOT applied, flagged for review (78% < 85%)
```

**Scenario 4: Per-Tag Override Allows Lower Threshold**

```
Global Threshold: 70%
Tag: "Newsletter" (override: 55%)
AI Confidence: 60%
Result: ✅ Tag applied (60% >= 55%, even though < 70% global)
```

## Manual Review Interface

### Accessing Manual Review

When tags are below threshold, they're flagged for manual review:

1. Go to **Options** > **Manual Review** (Manuelle Überprüfung) tab
2. See a list of all emails with low-confidence tag suggestions
3. Review each flagged email and decide to apply or dismiss tags

![Manual Review Interface](/doc/screenshots/manual-review.png)
_The manual review interface showing flagged emails_

### Manual Review Features

The Manual Review panel provides:

- **Filtering**:
  - By confidence level: Very low (<50%), Low (50-69%), Medium (70-79%)
  - By status: Pending, Reviewed
- **Sorting**:
  - By timestamp: Newest first, Oldest first
  - By confidence: Highest first, Lowest first
- **Actions per email**:
  - Apply tag manually
  - Dismiss tag suggestion
  - Mark as reviewed
  - Delete from review list

### Review Process

For each flagged email:

1. **View the details**:
   - Tag name and key
   - Confidence percentage (color-coded)
   - Threshold used (custom or global)
   - AI reasoning for the classification

2. **Make a decision**:
   - **Apply Tag**: Add the tag to the email despite low confidence
   - **Dismiss**: Reject the tag suggestion
   - **Mark as Reviewed**: Keep in list but mark as reviewed
   - **Delete**: Remove from the review list entirely

3. **Best practices**:
   - Read the email content to verify if the tag is appropriate
   - Consider the AI's reasoning
   - Use your judgment - you know your email better than the AI

## Analysis Results and Confidence Display

### Viewing Analysis Results

The **Analysis Results** (Analyseergebnisse) tab shows recent email analyses with confidence information:

1. Navigate to **Options** > **Analysis Results** tab
2. See a history of recent email analyses
3. Each result shows:
   - Email identifier
   - Applied tags with confidence badges
   - Low-confidence tags (highlighted with yellow background)
   - Reasoning for each classification

### Understanding Analysis Results

Each analysis result displays:

```
Email: [email identifier]
├── Tag: "Invoice" [82%] 🟢
│   └── Reasoning: Contains invoice number and payment due date
├── Tag: "Work" [65%] 🔴
│   └── Reasoning: From work domain, but content is personal
└── Tag: "Urgent" [88%] 🟢
    └── Reasoning: Contains urgent keywords in subject
```

## Tips and Best Practices

### Setting Thresholds

1. **Start with defaults**: The 70% default works well for most users
2. **Adjust based on experience**:
   - If too many false positives: Increase threshold
   - If too many misses: Decrease threshold
3. **Use per-tag overrides strategically**:
   - High thresholds for critical tags (Urgent, Invoice)
   - Lower thresholds for informational tags (Newsletter, Blog)

### Interpreting Confidence Scores

1. **Context matters**: A 65% confidence might be fine for a "Newsletter" tag but not for "Urgent"
2. **Look at reasoning**: The AI's explanation can help you decide
3. **Track patterns**: Note which tags consistently have high/low confidence

### Managing Manual Review

1. **Review regularly**: Don't let the review list grow too large
2. **Prioritize by confidence**: Review very low confidence items first
3. **Provide feedback**: Applying or dismissing tags helps you understand AI behavior

### Privacy Considerations

- Confidence scores are calculated locally or by your chosen AI provider
- Low-confidence flags are stored in Thunderbird's local storage
- No email content is sent to external services beyond your chosen AI provider

## Troubleshooting

### Issue: All Tags Showing Low Confidence

**Possible causes:**
- Threshold set too high
- AI model not well-suited for your email types
- Tag prompts unclear or too broad

**Solutions:**
- Lower your global threshold gradually
- Try a different AI provider/model
- Refine your tag prompts to be more specific

### Issue: No Tags Being Applied

**Possible causes:**
- Threshold set to 100%
- AI provider not responding correctly
- Tag configuration issues

**Solutions:**
- Check that threshold is reasonable (50-80%)
- Verify AI provider is working (check General Settings)
- Review tag prompts for clarity

### Issue: Manual Review List is Empty

**Possible causes:**
- All tags meeting threshold (good!)
- Threshold too low
- Recent emails not yet analyzed

**Solutions:**
- This is normal if threshold is working well
- Check Analysis Results to see recent classifications
- Wait for new emails to arrive

### Issue: Confidence Scores Seem Inaccurate

**Possible causes:**
- Different AI providers have different confidence scales
- Model limitations with certain email types
- Ambiguous email content

**Solutions:**
- Try a different AI provider to compare
- Use per-tag thresholds for problematic tags
- Rely on manual review for ambiguous cases

## Advanced Configuration

### Using Tags with Thunderbird Filters

Combine confidence-based tagging with Thunderbird's Message Filters:

1. Set up automatic tagging with confidence thresholds
2. Create Thunderbird filters based on the applied tags
3. Set filters to run periodically (tagging happens after initial filtering)

**Example workflow:**
```
Email arrives → AI analyzes → High-confidence tags applied →
Thunderbird filter moves tagged emails to folders →
You review low-confidence tags manually
```

### API and Integration (Developers)

For developers integrating with this feature:

- Confidence scores are stored in the `AnalysisCache` with per-tag breakdown
- Low-confidence flags use the storage key pattern: `lowConfidence_{cacheKey}`
- The `confidenceUtils` module provides helper functions for:
  - Converting between 0-1 and 0-100 ranges
  - Comparing confidence to thresholds
  - Formatting confidence for display
  - Getting effective thresholds (tag vs. global)

See the source code documentation for more details:
- `src/shared/utils/confidenceUtils.ts`
- `src/interfaces/shared/components/ConfidenceBadge.ts`
- `src/interfaces/options/ManualReviewPanel.ts`

## FAQ

**Q: Can I disable confidence thresholds entirely?**

A: Yes, set the global threshold to 0%. All tags will be applied regardless of confidence. Manual review will still be available.

**Q: What happens if I change the threshold after emails are analyzed?**

A: The new threshold only applies to future emails. Already analyzed emails keep their original tags. Use Manual Review to retroactively apply tags.

**Q: Do different AI providers report confidence differently?**

A: Yes. Confidence scales can vary between providers. It's recommended to adjust your thresholds when switching providers.

**Q: Can confidence scores improve over time?**

A: The extension doesn't learn from your corrections, but the underlying AI models may improve. Your feedback via manual review helps you understand AI patterns.

**Q: Is there a way to export confidence data?**

A: Confidence data is stored in Thunderbird's local storage and can be accessed through the browser's developer tools if needed for analysis.

## Glossary

- **Confidence Score**: A percentage (0-100%) indicating how certain the AI is about a classification
- **Threshold**: Minimum confidence required for a tag to be automatically applied
- **Global Threshold**: Default threshold applied to all tags unless overridden
- **Per-Tag Override**: Custom threshold for a specific tag, taking precedence over the global threshold
- **Low-Confidence Flag**: Marker for tags that didn't meet the threshold, requiring manual review
- **Manual Review**: Process of reviewing and deciding on low-confidence tag suggestions

## Related Documentation

- [Main README](/README.md) - Overview and installation
- [Architecture Documentation](/ARCHITECTURE.md) - Technical implementation details
- [E2E Testing](/docs/E2E-TESTING.md) - Testing confidence features
- [Source Code](/src/shared/utils/confidenceUtils.ts) - Confidence utility functions

---

**Version**: 1.0
**Last Updated**: 2025-01-06
**Feature Status**: ✅ Implemented and tested

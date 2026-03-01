## 1.0.0 - Enhanced Email Classification

### ✨ New Features

- 🎯 Bayes classifier system implemented to reduce LLM API costs through lightweight local email classification
- 🏷️ LLM can now classify emails with 5 additional tags: newsletters, promotions, social media, shipping updates, and financial alerts
- 🔄 Automatic tag creation ensures custom tags are properly synced with Thunderbird's native tag system

### 🛠️ Improvements

- 💡 Tag validation system now properly handles custom tags with automatic `_ma_` prefix conversion
- 🚀 Improved tag mapping between extension and Thunderbird's internal tag system
- 📊 Enhanced email classification accuracy with expanded tag options

### 🐛 Bug Fixes

- 🔧 Fixed critical tag validation error where custom tags failed with "Tags do not exist" message
- ✅ Fixed packaging problem caused by missing dependency installation after package.json modifications
- 🎯 Resolved tag sync issue where newly created custom tags weren't appearing in Thunderbird's tag system

---

## What's Changed

- type: fix tag validation and creation sync by @titus in commit-hash
- type: fix packaging problem by @titus in commit-hash  
- type: fix tag mapping and validation by @titus in commit-hash
- type: add new LLM selectable tags by @titus in commit-hash
- type: implement Bayes classifier for cost optimization by @titus in commit-hash

## Thanks to all contributors

@titus
# Release Process

## Simple Release Workflow

### Step 1: Update Version

Edit `manifest.json`:
```json
"version": "1.1.0"
```

### Step 2: Update Changelog

Edit `CHANGELOG.md` and add your changes under a new version heading.

### Step 3: Commit and Tag

```bash
git add .
git commit -m "Release v1.1.0"
git tag v1.1.0
git push origin main --tags
```

### Step 4: Create GitHub Release

1. Go to: https://github.com/Ophir-DOT/chromePicklistManager/releases
2. Click **"Create a new release"**
3. **Tag:** Select `v1.1.0`
4. **Title:** `Version 1.1.0`
5. **Description:** Copy changes from CHANGELOG.md
6. Click **"Publish release"**

**That's it!** No need to attach ZIP files - users can download from GitHub directly.

---

## How Users Get Updates

### For New Users:

1. Go to: https://github.com/Ophir-DOT/chromePicklistManager
2. Click **"Code"** → **"Download ZIP"**
3. Extract ZIP
4. Chrome → `chrome://extensions/` → Load unpacked

### For Existing Users:

**Automatic notification:**
- Extension checks GitHub every 24 hours
- Shows update banner: "🆕 Version 1.1.0 available"
- Click "Download" → Opens GitHub
- Download ZIP from tag or use "Code" button
- Extract to same location → Reload extension

**Manual update:**
- Download latest ZIP from GitHub
- Extract to **same folder** as current installation (overwrite)
- Go to `chrome://extensions/`
- Click reload button on extension

---

## Update Checker Behavior

The extension automatically:
- Checks for new releases on GitHub every 24 hours
- Compares tag version with current version
- Shows notification if newer version exists
- Links to GitHub for download (uses tag archive ZIP)

**No manual ZIP packaging needed!**

---

## Testing the Release

Before publishing:

1. Create release on GitHub
2. Wait 2-3 minutes
3. Open extension → Check console for update check logs
4. Should see update notification if version is newer

---

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **Major** (1.0.0 → 2.0.0): Breaking changes
- **Minor** (1.0.0 → 1.1.0): New features
- **Patch** (1.0.0 → 1.0.1): Bug fixes

---

## Quick Reference

```bash
# Full release command sequence:
vim manifest.json  # Update version
vim CHANGELOG.md   # Document changes
git add .
git commit -m "Release v1.1.0"
git tag v1.1.0
git push origin main --tags

# Then create GitHub Release manually
```

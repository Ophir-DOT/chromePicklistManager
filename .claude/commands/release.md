# Release to Git

Automate the git release workflow: verify branch state, merge to main with preserved commit history, create tag, and publish GitHub release.

## Workflow Steps

**IMPORTANT**: Execute these steps in order. Stop immediately if any step fails.

### Step 1: Pre-flight Validation

Run these checks in parallel:

```bash
# Check current branch is NOT main
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "main" ]; then
  echo "ERROR: You are on the main branch. Please switch to a feature branch first."
  exit 1
fi
echo "✓ Current branch: $CURRENT_BRANCH"

# Check working directory is clean
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: Working directory has uncommitted changes. Please commit or stash them first."
  git status --short
  exit 1
fi
echo "✓ Working directory is clean"

# Check branch is pushed to remote
LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/$CURRENT_BRANCH 2>/dev/null || echo "no-remote")
if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
  echo "ERROR: Branch $CURRENT_BRANCH is not pushed to remote or has unpushed commits."
  echo "Please run: git push origin $CURRENT_BRANCH"
  exit 1
fi
echo "✓ Branch is pushed to remote"
```

**Additional Check - Console.log Detection:**

After the above bash checks complete, use the Grep tool to search for console.log statements:

```
pattern: "console\.log"
glob: "*.js"
path: (search in background/, popup/, pages/, content/, settings/ directories)
output_mode: "content"
```

If console.log statements are found:
1. Display a warning message listing all files and locations
2. Ask the user: "⚠️ Found console.log statements. These should typically be removed before release. Do you want to continue anyway?"
3. If user says no or wants to remove them first, STOP the release process
4. If user says yes, continue to Step 2

If no console.log statements are found:
- Display "✓ No console.log statements found"
- Continue to Step 2

### Step 2: Extract Version from manifest.json

Read the current version from manifest.json (single source of truth):

Use the Read tool to read [manifest.json](manifest.json) and extract the version number from line 4.

Store the version in a variable for use in subsequent steps (e.g., if version is "1.6.0", the tag will be "v1.6.0").

### Step 3: Merge to Main (Preserve Commit History)

Execute these git commands sequentially:

```bash
# Switch to main branch
git checkout main

# Pull latest changes
git pull origin main

# Merge feature branch with --no-ff flag (creates merge commit)
git merge --no-ff $CURRENT_BRANCH -m "Merge branch '$CURRENT_BRANCH' - Release v{VERSION}"

# Verify merge succeeded
if [ $? -ne 0 ]; then
  echo "ERROR: Merge failed. Resolve conflicts manually."
  exit 1
fi
echo "✓ Merged $CURRENT_BRANCH into main with merge commit"
```

Where `{VERSION}` is the version extracted in Step 2.

### Step 4: Create Annotated Git Tag

```bash
# Create annotated tag with version and date
TAG_NAME="v{VERSION}"
TAG_MESSAGE="Release v{VERSION} - $(date +%Y-%m-%d)"

git tag -a "$TAG_NAME" -m "$TAG_MESSAGE"

if [ $? -eq 0 ]; then
  echo "✓ Created tag: $TAG_NAME"
else
  echo "ERROR: Failed to create tag $TAG_NAME"
  exit 1
fi
```

### Step 5: Push to Remote

```bash
# Push main branch
git push origin main

# Push tags
git push origin --tags

echo "✓ Pushed main branch and tags to remote"
```

### Step 6: Create GitHub Release

Extract release notes from CHANGELOG.md for the current version and create GitHub release:

```bash
# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
  echo "WARNING: GitHub CLI (gh) not found. Skipping release creation."
  echo "Install with: brew install gh"
  echo "You can manually create the release at: https://github.com/ophirpeleg/chromePicklistManager/releases/new"
  exit 0
fi

# Create release using gh CLI
gh release create "v{VERSION}" \
  --title "Release v{VERSION}" \
  --notes-file <(sed -n '/## \[{VERSION}\]/,/## \[/p' CHANGELOG.md | sed '$d') \
  --latest

if [ $? -eq 0 ]; then
  echo "✓ Created GitHub release: v{VERSION}"
  echo "View at: https://github.com/ophirpeleg/chromePicklistManager/releases/tag/v{VERSION}"
else
  echo "WARNING: Failed to create GitHub release. Create it manually at:"
  echo "https://github.com/ophirpeleg/chromePicklistManager/releases/new?tag=v{VERSION}"
fi
```

### Step 7: Summary

Display a summary of what was accomplished:

```bash
echo ""
echo "========================================="
echo "Release v{VERSION} Complete!"
echo "========================================="
echo "✓ Merged branch: $CURRENT_BRANCH → main"
echo "✓ Created tag: v{VERSION}"
echo "✓ Pushed to remote"
echo "✓ GitHub release created"
echo ""
echo "Next steps:"
echo "1. Verify release: https://github.com/ophirpeleg/chromePicklistManager/releases"
echo "2. Switch back to your feature branch: git checkout $CURRENT_BRANCH"
echo "========================================="
```

## Error Handling

- If any step fails, stop execution immediately
- Display clear error message with remediation steps
- Do not proceed to next step if previous step failed
- Leave git state in recoverable position

## Requirements

- Git repository must have remote origin configured
- GitHub CLI (gh) must be installed and authenticated for release creation
- CHANGELOG.md must have entry for current version
- manifest.json must have valid version number on line 4

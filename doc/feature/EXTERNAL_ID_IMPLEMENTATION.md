# External ID Field Implementation - Record Migrator

## Overview
This document describes the External ID field mapping feature added to the Record Migrator tool to solve the "insufficient access rights on cross-reference id" error that occurs when migrating records between Salesforce orgs.

## Problem Statement
When migrating records from a source org to a target org, the migration process was failing with errors like:
```
insufficient access rights on cross-reference id: a1V8d0000038bJm
```

This occurs because the migrator was attempting to insert records with source org IDs that don't exist in the target org.

## Solution
Store the source record ID in an External ID field on the target org. This allows:
1. Records to be inserted without reference errors
2. Maintaining the link between source and target records
3. Future syncs and updates to use the external ID as a reference key

## Implementation Details

### 1. User Interface (Step 4 - Migration Preview)

**File:** `pages/record-migrator/record-migrator.html`

Added a new configuration section with:
- Checkbox to enable external ID storage
- Dropdown to select which external ID field to use
- Refresh button to reload available fields
- Info message explaining the feature

```html
<div class="external-id-config">
  <h3>
    <span class="material-symbols-rounded">key</span>
    External ID Field Mapping (Optional)
  </h3>
  <p class="config-description">
    Store source record IDs in an external ID field on the target org...
  </p>
  <div class="form-group">
    <label for="externalIdFieldSelect">
      <input type="checkbox" id="useExternalIdCheckbox" />
      Store source IDs in external ID field
    </label>
  </div>
  <div id="externalIdFieldContainer" class="external-id-fields hidden">
    <div class="form-group">
      <label for="externalIdFieldSelect">Select External ID Field:</label>
      <select id="externalIdFieldSelect" class="external-id-select">
        <option value="">-- Select External ID Field --</option>
      </select>
      <button id="refreshExternalIdBtn" class="btn btn-text">
        <span class="material-symbols-rounded">refresh</span>
        Refresh Fields
      </button>
    </div>
    <div class="info-message">
      <span class="material-symbols-rounded">info</span>
      Only External ID text fields from the target org are shown...
    </div>
  </div>
</div>
```

### 2. Styling

**File:** `pages/record-migrator/record-migrator.css`

Added styles for the external ID configuration section with dark mode support:

```css
.external-id-config {
  padding: 20px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  margin-bottom: 20px;
  border-left: 3px solid var(--dot-purple, #6B3FA0);
}

.info-message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: #e3f2fd;
  border-radius: 6px;
  font-size: 13px;
  color: #0066cc;
  margin-top: 10px;
}

[data-theme="dark"] .info-message {
  background: rgba(33, 150, 243, 0.15);
  color: #64b5f6;
}
```

### 3. Client-Side Logic

**File:** `pages/record-migrator/record-migrator.js`

#### State Properties Added:
```javascript
const state = {
  // ... existing properties
  externalIdFields: [],           // Array of external ID fields from target org
  selectedExternalIdField: null,  // Selected field object
  useExternalId: false,           // Whether to use external ID feature
};
```

#### Key Functions:

**`loadExternalIdFields()`** - Queries target org for external ID fields
```javascript
async function loadExternalIdFields() {
  if (!state.targetSession || !state.selectedObject) {
    showStatus('Please select target org and object first', 'warning');
    return;
  }

  try {
    showStatus('Loading external ID fields from target org...', 'loading');

    // Get object describe from target org
    const endpoint = `${state.targetSession.instanceUrl}/services/data/v59.0/sobjects/${state.selectedObject.name}/describe`;

    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${state.targetSession.sessionId}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to describe ${state.selectedObject.name}: ${response.status}`);
    }

    const describe = await response.json();

    // Filter for external ID text fields
    state.externalIdFields = describe.fields.filter(field =>
      field.externalId &&
      field.createable &&
      (field.type === 'string' || field.type === 'text')
    );

    populateExternalIdSelect();
    hideStatus();

    if (state.externalIdFields.length === 0) {
      showStatus('No external ID fields found on target org. Please create an external ID text field first.', 'warning');
    }

  } catch (error) {
    console.error('[Record Migrator] Error loading external ID fields:', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
}
```

**`handleExternalIdToggle()`** - Shows/hides field selection UI
```javascript
function handleExternalIdToggle() {
  state.useExternalId = elements.useExternalIdCheckbox.checked;

  if (state.useExternalId) {
    elements.externalIdFieldContainer.classList.remove('hidden');
    // Load fields if not already loaded
    if (state.externalIdFields.length === 0) {
      loadExternalIdFields();
    }
  } else {
    elements.externalIdFieldContainer.classList.add('hidden');
    state.selectedExternalIdField = null;
  }
}
```

**Migration Config Updated:**
```javascript
config: {
  objectName: state.selectedObject.name,
  recordIds: state.selectedRecords,
  relationships: state.selectedRelationships,
  externalIdField: state.useExternalId && state.selectedExternalIdField
    ? state.selectedExternalIdField.name
    : null
}
```

### 4. Backend API Logic

**File:** `background/record-migrator-api.js`

#### Updated Function Signature:
```javascript
async upsertParentRecords(targetSession, objectName, records, externalIdField = null) {
  try {
    console.log('[RecordMigratorAPI] Upserting', records.length, 'parent records...');
    if (externalIdField) {
      console.log('[RecordMigratorAPI] Using external ID field:', externalIdField);
    }
    // ...
  }
}
```

#### External ID Field Population Logic:
```javascript
// Prepare records for insert (remove Id and attributes)
const recordsToInsert = batch.map(record => {
  const sourceId = record.Id;
  const cleanRecord = { ...record };
  delete cleanRecord.Id;
  delete cleanRecord.attributes;

  // Remove system fields
  delete cleanRecord.CreatedDate;
  delete cleanRecord.CreatedById;
  delete cleanRecord.LastModifiedDate;
  delete cleanRecord.LastModifiedById;
  delete cleanRecord.SystemModstamp;

  // Store source ID in external ID field if specified
  if (externalIdField) {
    cleanRecord[externalIdField] = sourceId;
  }

  return { sourceId, record: cleanRecord };
});
```

#### Migration Function Updated:
```javascript
async migrateRecords(sourceSession, targetSession, config) {
  // ...

  // Step 2: Upsert parent records to target org
  console.log('[RecordMigratorAPI] Step 2: Upserting parent records...');
  const parentResults = await this.upsertParentRecords(
    targetSession,
    config.objectName,
    parentRecords,
    config.externalIdField // Pass external ID field for storing source IDs
  );

  // ...
}
```

## User Workflow

1. **Navigate to Step 4** (Migration Preview)
2. **Check "Store source IDs in external ID field"** checkbox
3. **System automatically loads** all External ID text fields from the target org
4. **Select the desired field** from the dropdown (e.g., "Source_Record_ID__c")
5. **Click "Start Migration"** - source record IDs will be stored in the selected field

## Technical Requirements

### For Target Org:
- Must have a custom **Text field** with the **External ID** checkbox enabled
- Field must be **createable** (not read-only)
- Recommended field name: `Source_Record_ID__c` or similar

### Field Filtering Logic:
Only fields matching ALL criteria are shown:
- `field.externalId === true`
- `field.createable === true`
- `field.type === 'string' || field.type === 'text'`

## Benefits

1. **Eliminates Cross-Reference Errors**: Records can be inserted without existing ID references
2. **Maintains Record Links**: Source IDs are preserved for future reference
3. **Enables Future Syncs**: External ID can be used for upsert operations in subsequent migrations
4. **Audit Trail**: Easy to trace which source record each target record came from
5. **Data Integrity**: Proper Salesforce pattern for cross-org record tracking

## Testing Checklist

- [ ] External ID checkbox toggles visibility of field selector
- [ ] Dropdown populates with only External ID text fields
- [ ] Refresh button reloads fields from target org
- [ ] Warning displays if no external ID fields exist
- [ ] Migration stores source IDs in selected field
- [ ] Migration still works without external ID field (optional feature)
- [ ] Dark mode styling displays correctly
- [ ] Error handling works if field selection fails

## Future Enhancements

1. **Auto-detect existing external ID fields** during org selection
2. **Support child record external IDs** (currently only parent records)
3. **Smart field recommendations** based on field naming conventions
4. **Upsert instead of insert** when external ID field has existing values
5. **Validation** to prevent selecting fields that are too short to hold IDs

## Related Files

- `pages/record-migrator/record-migrator.html` (UI)
- `pages/record-migrator/record-migrator.js` (Client logic)
- `pages/record-migrator/record-migrator.css` (Styling)
- `background/record-migrator-api.js` (API logic)

## Salesforce Best Practice Reference

This implementation follows Salesforce's recommended pattern for cross-org data migration using External ID fields. See:
- [Salesforce External ID Documentation](https://help.salesforce.com/articleView?id=sf.fields_about_ids.htm)
- [Upsert Using External IDs](https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_calls_upsert.htm)

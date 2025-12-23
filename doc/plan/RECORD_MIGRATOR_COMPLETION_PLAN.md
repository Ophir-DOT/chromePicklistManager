# Record Migrator - Completion Architecture Plan

**Document Type**: Implementation Plan
**Status**: Draft
**Last Updated**: 2025-12-21
**Feature Version**: 1.8+

## Overview

This document outlines the architecture for completing the Record Migrator feature. The basic migration framework is in place; this plan focuses on advanced features like field mapping, enhanced error handling, and real-time progress tracking.

## Current State Analysis

### What's Working
- UI: Complete 4-step wizard with responsive design
- Session management: Auto-detects active Salesforce orgs
- Record selection: Query and multi-select records
- Relationship detection: Identifies child relationships with counts
- Core migration: Migrates parent/child records with ID remapping
- State remapping: Automatic CompSuite__State__c field remapping
- External ID support: Stores source IDs for future syncs

### What Needs Implementation
1. Advanced Field Mapping
2. Enhanced Error Handling & Rollback
3. Real-time Progress Updates with Step Details
4. Picklist Value Mapping
5. Field Type Validation & Mismatch Detection
6. Batch Processing Status Updates

---

## Phase 1: Enhanced Progress Tracking & Error Handling

### 1.1 Real-time Progress Updates

**Current State**: UI has progress bar but backend doesn't send updates

**Implementation**:
- Modify `RecordMigratorAPI.migrateRecords()` to return a generator/iterator pattern
- Implement progress callback system:
  - `onProgress(step, current, total, message)`
  - Steps: "Exporting Parent", "Building ID Mapping", "Upserting Parent", "Exporting Child", "Upserting Child"

**Files to Modify**:
- `background/record-migrator-api.js` - Add progress callback parameter
- `pages/record-migrator/record-migrator.js` - Handle progress updates via message handler

**Message Pattern**:
```javascript
// New message action
chrome.runtime.sendMessage({
  action: 'MIGRATE_RECORDS',
  sourceSession: {...},
  targetSession: {...},
  config: {...},
  progressCallback: true // Enable progress updates
})
```

### 1.2 Enhanced Error Handling

**Current State**: Single error array, no context per record

**Implementation**:
- Track errors by record ID, field name, and API response
- Create error categorization system:
  - `REQUIRED_FIELD_MISSING` - Required field not in target
  - `FIELD_TYPE_MISMATCH` - Field exists but different type
  - `VALIDATION_RULE_FAILED` - Salesforce validation failed
  - `LOOKUP_NOT_FOUND` - Referenced record ID not in mapping
  - `API_LIMIT_EXCEEDED` - Rate limiting
  - `PERMISSION_DENIED` - FLS/CRUD permission issue

**Files to Modify**:
- `background/record-migrator-api.js` - Enhanced error capture with context
- `pages/record-migrator/record-migrator.js` - Display errors by category

**Error Response Format**:
```javascript
{
  success: false,
  code: 'FIELD_TYPE_MISMATCH',
  field: 'Industry__c',
  sourceType: 'picklist',
  targetType: 'text',
  recordId: 'a01xx000000001',
  message: 'Field type mismatch for Industry__c'
}
```

### 1.3 Rollback Capability

**Current State**: No rollback after failed migration

**Implementation**:
- Store created record IDs during migration
- Add "Rollback Migration" button in results view
- Bulk delete created records in target org if rollback requested

**Files to Create**:
- `background/rollback-api.js` - Delete created records

---

## Phase 2: Field Mapping Interface

### 2.1 Field Mapping UI (Step 2.5 - New)

**Location**: Between Step 2 (Record Selection) and Step 3 (Relationships)

**Features**:
1. Auto-detect field differences between orgs
2. Auto-map fields with same API names
3. Manual mapping for renamed fields
4. Handle missing fields (skip or error)
5. Show field metadata (type, required, createable)

**UI Components**:
- Table: Source Field → Target Field → Action (auto/manual/skip)
- Status badges: "Match", "Different Type", "Missing in Target", "Manual Mapping"
- Quick buttons: "Auto-map all", "Clear all mappings", "Validate mappings"

**Files to Create**:
- `pages/record-migrator/field-mapper.js` - Field mapping logic
- `pages/record-migrator/field-mapper-ui.html` - (Already in HTML, just implement JS)

### 2.2 Field Mapping Logic

**Implementation**:
1. Query source object fields (already done in `exportParentRecords`)
2. Query target object fields (use Describe API)
3. Compare and categorize:
   - Exact match by API name
   - Type compatible fields
   - Incompatible fields (skip with warning)
4. Apply mapping during upsert (clean data before insert)

**Key Functions in `background/record-migrator-api.js`**:
- `buildFieldMapping(sourceFields, targetFields)` - Compare and suggest mapping
- `validateFieldMapping(mapping, sourceFields, targetFields)` - Check compatibility
- `mapRecordFields(record, fieldMapping)` - Apply mapping before upsert

---

## Phase 3: Picklist Value Mapping

### 3.1 Picklist Detection & Mapping UI

**Current State**: Picklist values migrated as-is, may not exist in target org

**Implementation**:
1. Detect picklist fields during field mapping
2. Query picklist values from both orgs
3. Create mapping interface for picklist values
4. Support value transformation (source value → target value)

**UI**:
- Show picklist fields with mismatched values
- Matrix view: Source Value → Target Value dropdown
- Auto-match by label (if available)
- Mark unmapped values for manual resolution

**Files to Modify**:
- `background/record-migrator-api.js` - Add picklist detection/mapping functions
- `pages/record-migrator/record-migrator.html` - Add picklist mapping section
- `pages/record-migrator/record-migrator.js` - Manage picklist mappings

### 3.2 Picklist Mapping Logic

**Key Functions**:
- `getPicklistValues(session, objectName, fieldName)` - Get available values
- `detectPicklistFields(sourceFields, targetFields)` - Identify picklist fields
- `buildPicklistMapping(sourceValues, targetValues)` - Create mapping
- `mapPicklistValues(record, picklistMapping)` - Apply during upsert

---

## Phase 4: Advanced Validation

### 4.1 Pre-migration Validation

**Checks**:
1. All required fields present in target object
2. Field types compatible
3. Picklist values exist in target
4. External ID field exists (if enabled)
5. User has sufficient permissions (describe checks)
6. API limits available (estimate batch count)

**UI**:
- Validation report before "Start Migration"
- Show warnings and errors
- Option to proceed with warnings or fix first

**Files to Modify**:
- `background/record-migrator-api.js` - Add validation functions
- `pages/record-migrator/record-migrator.js` - Validation UI

### 4.2 Data Type Handling

**Implementation**:
- String → Text/Long Text: OK
- Number → Currency/Number: Check precision
- Date → DateTime: Add default time
- Picklist → Text: Store API name
- Lookup → Lookup: Remap parent IDs (already done)

**Files to Modify**:
- `background/record-migrator-api.js` - Add type conversion functions

---

## Phase 5: Batch Processing Improvements

### 5.1 API Limit Awareness

**Current**: Hardcoded batch size of 200

**Enhancement**:
- Track API calls made
- Estimate remaining calls before limit
- Show API usage in progress bar
- Pause if approaching limit

**Functions**:
- `estimateApiCallsNeeded(records, children)` - Calculate calls
- `trackApiUsage()` - Monitor during migration

### 5.2 Resume Capability

**Implementation**:
- Save migration checkpoint in chrome.storage
- If connection lost, offer "Resume" on migration page
- Skip already-created records, continue from checkpoint

---

## Implementation Sequence

**Phase 1** (Critical): Enhanced Progress Tracking
1. Implement progress callback system
2. Update UI to display step details
3. Better error categorization

**Phase 2** (Important): Field Mapping
1. Auto-detect field differences
2. Build mapping UI
3. Apply mappings during upsert

**Phase 3** (Important): Picklist Mapping
1. Detect picklist fields
2. Query values from both orgs
3. Create mapping interface

**Phase 4** (Nice-to-have): Validation & Type Handling
1. Pre-migration validation report
2. Data type conversion functions
3. Field type mismatch detection

**Phase 5** (Polish): Batch & API Management
1. API limit tracking
2. Resume capability
3. Better progress estimates

---

## Data Flow Architecture

```
User Interaction (UI)
    ↓
Step 1: Org Selection → Validate orgs are different
    ↓
Step 2: Record Selection → Query and filter records
    ↓
[NEW] Step 2.5: Field Mapping → Build field mappings
    ↓
[NEW] Step 2.75: Picklist Mapping → Map picklist values (if needed)
    ↓
Step 3: Relationship Config → Select child relationships
    ↓
Step 4: Review & Execute
    ├── External ID config
    ├── [NEW] Field validation
    ├── [NEW] Data completeness check
    └── Start Migration
        ↓
    Service Worker (MIGRATE_RECORDS)
        ↓
    Phase 1: Export parent records
        ├── Build field mapping
        ├── Build picklist mapping
        └── Send progress: "Exporting parent records (X/Y)"
        ↓
    Phase 2: Build State ID mapping
        └── Send progress: "Building State ID mapping"
        ↓
    Phase 3: Upsert parent records
        ├── Apply field mappings
        ├── Apply picklist mappings
        ├── Store source IDs in external ID field
        ├── Batch upsert
        └── Send progress: "Upserting parent records (X/Y)"
        ↓
    Phase 4: Export child records
        └── For each relationship, export with mapped IDs
        ↓
    Phase 5: Upsert child records
        ├── Apply field mappings
        ├── Remap parent IDs
        ├── Remap State IDs
        └── Send progress: "Upserting child records (X/Y)"
        ↓
    Return results with error details
        ↓
UI displays results with:
├── Success count by type
├── Errors grouped by category
├── Option to rollback
└── Log export
```

---

## File Structure After Implementation

```
pages/record-migrator/
├── record-migrator.html          [Add field-mapper section]
├── record-migrator.js            [Add mapping logic & progress handler]
├── record-migrator.css           [Add mapping section styles]
├── field-mapper.js               [NEW - Field mapping utilities]
└── picklist-mapper.js            [NEW - Picklist mapping utilities]

background/
├── record-migrator-api.js        [Add all new functions]
├── rollback-api.js               [NEW - Rollback functionality]
└── service-worker.js             [Add progress streaming support]
```

---

## Error Handling Strategy

**Granular Error Tracking**:
- Record-level errors (one field failed, record partially migrated?)
- Batch-level errors (entire batch failed)
- Migration-level errors (entire migration failed)

**User Experience**:
- Show "X records succeeded, Y failed" summary
- Expand to see individual failures
- Offer rollback if > 10% failures
- Option to retry failed records

---

## Testing Strategy

**Unit Tests**:
- Field mapping logic
- Picklist value matching
- Type conversion functions
- Error categorization

**E2E Tests**:
- Full migration with field mapping
- Picklist value remapping
- Error scenarios (missing fields, type mismatch)
- Rollback functionality

**Manual Testing Checklist**:
- [ ] Migrate records with auto-mapped fields
- [ ] Migrate with manual field mappings
- [ ] Handle missing target fields
- [ ] Remap picklist values
- [ ] Verify State ID remapping
- [ ] Store external IDs correctly
- [ ] Test rollback on failures
- [ ] Verify progress tracking accuracy
- [ ] Test with >200 records (batching)
- [ ] Test with child relationships

---

## Success Criteria

- User can map fields before migration
- Picklist values are correctly remapped
- Errors are categorized and reported
- Progress shows actual step details
- Migration can be rolled back if needed
- No records are partially migrated (all-or-none per record)
- API limits are respected and warned about
- All field types are handled appropriately

---

## Notes & Considerations

- **All-or-none semantics**: Use composite API's `allOrNone: false` to allow partial successes but track individually
- **External ID field**: Works with any text field, great for incremental syncs
- **State ID remapping**: Already implemented, model for other lookup remapping
- **API limits**: 50,000 API calls per day on some orgs, batch size of 200 = efficient
- **Large migrations**: Consider showing estimated time based on record count and batch size


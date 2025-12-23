# TODO - Feature Roadmap

This document outlines planned features and enhancements for the DOT Toolkit Chrome Extension.

---

## 🎯 Planned Features

### 1. Validation Rule Manager
**Description**: Comprehensive tool for managing validation rules across the org.

**Features**:
- Export all validation rules to readable format (CSV/JSON)
- Disable/enable validation rules in bulk (useful during migrations)
- Test validation rules against sample data
- Search across validation rules by formula or error message
- Clone validation rules to other objects

**API Requirements**:
- Metadata API - ValidationRule type
- Tooling API for validation rule queries

**Complexity**: Medium
**Status**: Not Started

---

### 2. Profile/Permission Set Comparison & Import
**Description**: Critical tool for compliance and security audits with cross-environment import capabilities.

**Features**:
- Compare field-level security across profiles/permission sets
- Identify permission gaps or over-privileges
- Export object/field permissions matrix
- **Import permission exports from another environment**
- Bulk permission updates for specific fields
- Track changes over time
- Map profiles/permission sets between source and target environments
- Preview permission changes before deployment
- Selective import (choose which permissions to apply)

**API Requirements**:
- Metadata API - Profile and PermissionSet types
- Tooling API for permission queries
- FieldPermissions and ObjectPermissions metadata

**Complexity**: Large
**Status**: Not Started

---

### 3. Org Compare Tool
**Description**: Side-by-side comparison of configurations between two Salesforce environments.

**Features**:
- Side-by-side object comparison (fields, validation rules, etc.)
- Configuration drift detection
- Sync wizard to align configurations
- Pre-migration verification
- Compare picklists, workflows, validation rules
- Export comparison reports
- Highlight differences with visual diff

**API Requirements**:
- Metadata API from both orgs
- REST API for object metadata

**Complexity**: Large
**Status**: Not Started

---

### 4. Dark Mode Theme
**Description**: Add dark mode support following Dot Compliance design system.

**Features**:
- Toggle between light/dark themes
- Persist user preference
- Maintain brand colors in dark mode (Deep Purple #270648, Pink #DD0087)
- Smooth theme transitions
- Apply to popup, settings, and health check pages
- Update design tokens for dark mode variants

**API Requirements**:
- Chrome Storage API for preference persistence

**Complexity**: Small
**Status**: Not Started

---

### 5. Batch Job Monitor
**Description**: Real-time monitoring of Salesforce asynchronous operations.

**Features**:
- View all running/queued Apex jobs
- Monitor deployment queue
- Track long-running operations
- Quick abort capability
- Filter by job type (Batch, Future, Queueable, Scheduled)
- Show job progress and status
- Auto-refresh with configurable interval
- Email notifications for job completion/failure

**API Requirements**:
- Tooling API - AsyncApexJob queries
- REST API - Deployment status
- Metadata API - checkDeployStatus

**Complexity**: Medium
**Status**: Not Started

---

### 6. Export Fields
**Description**: Export field definitions and metadata from Salesforce objects.

**Features**:
- Export all fields from selected object(s)
- Support multiple export formats (CSV, JSON, Excel)
- Include field properties (label, API name, type, required, default value, etc.)
- Export field-level security settings
- Bulk export across multiple objects
- Filter fields by type, custom/standard, or other criteria
- Include relationship details and formula definitions

**API Requirements**:
- REST API - Describe calls for field metadata
- Tooling API - CustomField queries
- Metadata API - Field definitions

**Complexity**: Medium
**Status**: ✅ Completed in v1.5.0

---

## 📋 Implementation Notes

### Development Priorities
1. Implement features in order based on user value and complexity
2. Follow existing architecture patterns (Manifest V3, XMLHttpRequest, modular design)
3. Update CHANGELOG.md and README.md for each feature
4. Follow design_guide.md for all UI/UX implementations

### Technical Considerations
- Maintain compatibility with Manifest V3
- Continue using XMLHttpRequest pattern for API calls
- Follow existing modular architecture (background/popup/content)
- Use existing Metadata API deployment patterns
- Add comprehensive error handling
- Implement proper loading states and user feedback
- Support both Lightning and Classic Salesforce

### Testing Requirements
- Test on both Lightning and Classic
- Test with different Salesforce editions
- Validate Metadata API XML generation
- Test deployment rollback scenarios
- Cross-browser testing (Chrome, Edge)
- Test with large datasets and slow queries

---

## 🤝 Contributing

If you'd like to contribute to any of these features:
1. Pick a feature from the list
2. Comment on or create an issue
3. Submit a PR with your implementation
4. Update this TODO with implementation notes
5. Update CHANGELOG.md and README.md with new feature documentation

---

**Last Updated**: 2025-11-18
**Extension Version**: 1.4.0

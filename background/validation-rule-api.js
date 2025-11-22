// Validation Rule API Client
// Provides methods to query and manage Salesforce Validation Rules
// Uses Tooling API for ValidationRule queries and Metadata API for updates

import SalesforceAPI from './api-client.js';
import SessionManager from './session-manager.js';

class ValidationRuleAPI {
  /**
   * Query ValidationRule records with optional filters
   * @param {object} options - Query options
   * @param {string} options.objectName - Filter by SObject (EntityDefinition.QualifiedApiName)
   * @param {boolean} options.activeOnly - Filter by Active status
   * @param {string} options.searchTerm - Search in name, error message, or formula
   * @param {number} options.limit - Maximum number of records to return (default 200)
   * @returns {Promise<Array>} Array of validation rule records
   */
  static async getValidationRules(options = {}) {
    const { objectName, activeOnly, searchTerm, limit = 200 } = options;

    // Build WHERE clause
    // Note: Avoid relationship field traversal (EntityDefinition.QualifiedApiName) as it causes 500 errors
    // Filter by objectName client-side instead
    const conditions = [];

    if (activeOnly !== undefined) {
      conditions.push(`Active = ${activeOnly}`);
    }

    // Build query
    // Note: Cannot include Metadata or FullName when returning multiple rows
    // Those fields must be fetched individually per rule when needed
    // Also avoiding relationship fields that cause 500 errors
    let query = `
      SELECT Id, ValidationName, Active, Description,
             ErrorDisplayField, ErrorMessage, EntityDefinitionId,
             CreatedDate, LastModifiedDate, LastModifiedById,
             NamespacePrefix, ManageableState
      FROM ValidationRule
    `;

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY ValidationName LIMIT ${limit}`;

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;

    try{
      const response = await SalesforceAPI.callAPI(endpoint);
      let rules = response.records || [];

      // Fetch object labels for all EntityDefinitionIds
      const entityIds = [...new Set(rules.map(r => r.EntityDefinitionId).filter(Boolean))];
      let entityLabels = new Map();

      if (entityIds.length > 0) {
        entityLabels = await this.getEntityDefinitionLabels(entityIds);
      }

      // Enrich rules with object labels and API names
      rules = rules.map(rule => {
        const entityData = entityLabels.get(rule.EntityDefinitionId);
        return {
          ...rule,
          ObjectLabel: entityData?.label || rule.EntityDefinitionId,
          ObjectApiName: entityData?.apiName || rule.EntityDefinitionId
        };
      });

      // Apply objectName filter on client side (Tooling API 500s on relationship field traversal)
      // Filter by ObjectApiName (the actual API name from EntityDefinition)
      if (objectName) {
        rules = rules.filter(rule => rule.ObjectApiName === objectName);
      }

      // Apply search filter on client side (Tooling API doesn't support LIKE on all fields)
      // Note: Formula search requires fetching Metadata which is expensive, so we only search basic fields
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        rules = rules.filter(rule => {
          return rule.ValidationName?.toLowerCase().includes(term) ||
            rule.ErrorMessage?.toLowerCase().includes(term) ||
            rule.Description?.toLowerCase().includes(term) ||
            rule.ObjectLabel?.toLowerCase().includes(term) ||
            rule.ObjectApiName?.toLowerCase().includes(term);
        });
      }

      return rules;
    } catch (error) {
      console.error('[ValidationRuleAPI] Error querying validation rules:', error);
      throw error;
    }
  }

  /**
   * Get validation rules grouped by object
   * @param {object} options - Query options
   * @returns {Promise<object>} Object grouped by SObject name
   */
  static async getValidationRulesByObject(options = {}) {
    const rules = await this.getValidationRules(options);

    const grouped = {};
    rules.forEach(rule => {
      const objectName = rule.ObjectApiName || 'Unknown';
      if (!grouped[objectName]) {
        grouped[objectName] = {
          objectName: objectName,
          objectLabel: rule.ObjectLabel || objectName,
          rules: []
        };
      }
      grouped[objectName].rules.push(rule);
    });

    return grouped;
  }

  /**
   * Get a single validation rule by ID
   * @param {string} ruleId - The ValidationRule Id
   * @returns {Promise<object>} Validation rule record
   */
  static async getValidationRule(ruleId) {
    const query = `
      SELECT Id, ValidationName, Active, Description,
             ErrorDisplayField, ErrorMessage, EntityDefinitionId,
             CreatedDate, LastModifiedDate, LastModifiedById,
             NamespacePrefix, ManageableState, FullName, Metadata
      FROM ValidationRule
      WHERE Id = '${ruleId}'
    `;

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);
      if (!response.records || response.records.length === 0) {
        throw new Error(`Validation rule not found: ${ruleId}`);
      }
      return response.records[0];
    } catch (error) {
      console.error('[ValidationRuleAPI] Error getting validation rule:', error);
      throw error;
    }
  }

  /**
   * Fetch Metadata for multiple rules (for export)
   * Due to Salesforce limitation, Metadata must be fetched one at a time
   * @param {Array} rules - Array of rule records (with Id)
   * @param {Function} progressCallback - Optional callback for progress updates
   * @returns {Promise<Array>} Rules with Metadata populated
   */
  static async fetchMetadataForRules(rules, progressCallback = null) {
    const rulesWithMetadata = [];

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];

      try {
        // Fetch individual rule with Metadata
        const fullRule = await this.getValidationRule(rule.Id);
        rulesWithMetadata.push({
          ...rule,
          Metadata: fullRule.Metadata,
          FullName: fullRule.FullName
        });
      } catch (error) {
        console.error('[ValidationRuleAPI] Error fetching metadata for rule', rule.Id, ':', error);
        // Keep the rule without metadata
        rulesWithMetadata.push(rule);
      }

      // Report progress
      if (progressCallback) {
        progressCallback(i + 1, rules.length);
      }
    }

    return rulesWithMetadata;
  }

  /**
   * Get summary statistics for validation rules
   * @returns {Promise<object>} Summary statistics
   */
  static async getValidationRuleSummary() {
    try {
      // Query all rules and calculate counts client-side
      // Tooling API has limited support for aggregate functions
      const query = `
        SELECT Id, Active, EntityDefinitionId
        FROM ValidationRule
      `;

      const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;

      const response = await SalesforceAPI.callAPI(endpoint);

      const summary = {
        active: 0,
        inactive: 0,
        total: 0,
        objectCount: 0
      };

      if (response.records) {
        const objectIds = new Set();

        response.records.forEach(record => {
          summary.total++;
          if (record.Active) {
            summary.active++;
          } else {
            summary.inactive++;
          }
          if (record.EntityDefinitionId) {
            objectIds.add(record.EntityDefinitionId);
          }
        });

        summary.objectCount = objectIds.size;
      }

      return summary;
    } catch (error) {
      console.error('[ValidationRuleAPI] Error getting summary:', error);
      throw error;
    }
  }

  /**
   * Get list of objects that have validation rules
   * @returns {Promise<Array>} Array of object names
   */
  static async getObjectsWithValidationRules() {
    // Query all rules and aggregate client-side
    // Avoiding relationship fields that cause 500 errors
    const query = `
      SELECT Id, EntityDefinitionId
      FROM ValidationRule
    `;

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);

      // Aggregate counts client-side by EntityDefinitionId
      const objectMap = new Map();

      response.records?.forEach(record => {
        const entityId = record.EntityDefinitionId;

        if (entityId) {
          if (!objectMap.has(entityId)) {
            objectMap.set(entityId, {
              entityId: entityId, // The EntityDefinition record ID
              apiName: entityId,  // Will be updated with actual API name
              label: entityId,    // Will be updated with actual label
              ruleCount: 0
            });
          }
          objectMap.get(entityId).ruleCount++;
        }
      });

      // Fetch labels for all objects using EntityDefinition IDs
      const entityIds = Array.from(objectMap.keys());
      if (entityIds.length > 0) {
        const entityLabels = await this.getEntityDefinitionLabels(entityIds);

        // Update the map with actual labels and API names
        // Map.forEach receives (value, key) as parameters
        entityLabels.forEach((labelData, entityId) => {
          if (objectMap.has(entityId)) {
            const obj = objectMap.get(entityId);
            obj.label = labelData.label;
            obj.apiName = labelData.apiName;
          }
        });
      }

      // Convert to array and sort by label
      const objects = Array.from(objectMap.values())
        .sort((a, b) => a.label.localeCompare(b.label));

      return objects;
    } catch (error) {
      console.error('[ValidationRuleAPI] Error getting objects:', error);
      throw error;
    }
  }

  /**
   * Get labels for EntityDefinition records
   * @param {Array} entityIds - Array of EntityDefinition record IDs
   * @returns {Promise<Map>} Map of entityId -> {label, apiName}
   */
  static async getEntityDefinitionLabels(entityIds) {
    // Build IN clause for the query - EntityDefinitionId is the record ID
    const inClause = entityIds.map(id => `'${id}'`).join(',');

    const query = `
      SELECT DurableId, QualifiedApiName, Label
      FROM EntityDefinition
      WHERE DurableId IN (${inClause})
    `;

    // EntityDefinition is queried via regular REST API, not Tooling API
    const endpoint = `/services/data/v59.0/query/?q=${encodeURIComponent(query)}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);

      const labelMap = new Map();
      response.records?.forEach(record => {
        // Map the EntityDefinition DurableId to both label and API name
        labelMap.set(record.DurableId, {
          label: record.Label,
          apiName: record.QualifiedApiName
        });
      });

      return labelMap;
    } catch (error) {
      console.error('[ValidationRuleAPI] Error getting entity labels:', error);
      // Return empty map on error - we'll fall back to API names
      return new Map();
    }
  }

  /**
   * Update validation rule active status using Tooling API
   * @param {string} ruleId - The ValidationRule Id
   * @param {boolean} active - New active status
   * @returns {Promise<object>} Result of update operation
   */
  static async updateValidationRuleStatus(ruleId, active) {
    // First get the full rule metadata
    const rule = await this.getValidationRule(ruleId);

    if (!rule.Metadata) {
      throw new Error('Unable to retrieve rule metadata');
    }

    // Update the metadata
    const updatedMetadata = {
      ...rule.Metadata,
      active: active
    };

    const endpoint = `/services/data/v59.0/tooling/sobjects/ValidationRule/${ruleId}`;

    try {
      await SalesforceAPI.callAPI(endpoint, {
        method: 'PATCH',
        body: {
          Metadata: updatedMetadata
        }
      });

      return { success: true, ruleId, active };
    } catch (error) {
      console.error('[ValidationRuleAPI] Error updating validation rule:', error);
      throw error;
    }
  }

  /**
   * Bulk update validation rule statuses
   * @param {Array} ruleUpdates - Array of {id, active} objects
   * @returns {Promise<object>} Results of bulk update
   */
  static async bulkUpdateValidationRuleStatus(ruleUpdates) {
    const results = {
      success: [],
      errors: []
    };

    // Process updates sequentially to avoid hitting API limits
    for (const update of ruleUpdates) {
      try {
        await this.updateValidationRuleStatus(update.id, update.active);
        results.success.push(update.id);
      } catch (error) {
        console.error('[ValidationRuleAPI] Error updating rule', update.id, ':', error);
        results.errors.push({
          id: update.id,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Export validation rules to JSON format
   * @param {Array} rules - Array of validation rule records
   * @returns {string} JSON string
   */
  static exportToJSON(rules) {
    const exportData = rules.map(rule => ({
      id: rule.Id,
      name: rule.ValidationName,
      object: rule.EntityDefinition?.QualifiedApiName || rule.EntityDefinitionId,
      objectLabel: rule.EntityDefinition?.Label || rule.EntityDefinitionId,
      active: rule.Active,
      description: rule.Description,
      errorConditionFormula: rule.Metadata?.errorConditionFormula || '',
      errorDisplayField: rule.ErrorDisplayField,
      errorMessage: rule.ErrorMessage,
      namespacePrefix: rule.NamespacePrefix,
      lastModifiedDate: rule.LastModifiedDate,
      lastModifiedBy: rule.LastModifiedBy?.Name || rule.LastModifiedById
    }));

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export validation rules to CSV format
   * @param {Array} rules - Array of validation rule records
   * @returns {string} CSV string
   */
  static exportToCSV(rules) {
    const headers = [
      'Object API Name',
      'Object Label',
      'Rule Name',
      'Active',
      'Description',
      'Error Condition Formula',
      'Error Display Field',
      'Error Message',
      'Namespace',
      'Last Modified Date',
      'Last Modified By'
    ];

    const rows = rules.map(rule => [
      rule.EntityDefinition?.QualifiedApiName || rule.EntityDefinitionId || '',
      rule.EntityDefinition?.Label || rule.EntityDefinitionId || '',
      rule.ValidationName || '',
      rule.Active ? 'TRUE' : 'FALSE',
      this.escapeCSV(rule.Description || ''),
      this.escapeCSV(rule.Metadata?.errorConditionFormula || ''),
      rule.ErrorDisplayField || '',
      this.escapeCSV(rule.ErrorMessage || ''),
      rule.NamespacePrefix || '',
      rule.LastModifiedDate || '',
      rule.LastModifiedBy?.Name || rule.LastModifiedById || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    return csv;
  }

  /**
   * Escape a value for CSV format
   * @param {string} value - The value to escape
   * @returns {string} Escaped value
   */
  static escapeCSV(value) {
    if (!value) return '';
    // If value contains comma, newline, or quote, wrap in quotes and escape existing quotes
    if (value.includes(',') || value.includes('\n') || value.includes('"')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  /**
   * Parse validation rule formula to identify referenced fields
   * @param {string} formula - The ErrorConditionFormula
   * @returns {Array} Array of field references
   */
  static parseFormulaFields(formula) {
    if (!formula) return [];

    // Match field references like: FieldName, Object__r.FieldName, $User.Id
    const fieldPattern = /(?:\$[A-Za-z]+\.)?[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/g;
    const matches = formula.match(fieldPattern) || [];

    // Filter out formula functions and common keywords
    const keywords = ['AND', 'OR', 'NOT', 'IF', 'CASE', 'ISBLANK', 'ISNULL', 'ISCHANGED', 'ISNEW',
                     'TEXT', 'VALUE', 'LEN', 'LEFT', 'RIGHT', 'MID', 'TRIM', 'UPPER', 'LOWER',
                     'CONTAINS', 'BEGINS', 'FIND', 'SUBSTITUTE', 'TODAY', 'NOW', 'YEAR', 'MONTH',
                     'DAY', 'DATEVALUE', 'DATETIMEVALUE', 'TRUE', 'FALSE', 'NULL', 'PRIORVALUE',
                     'REGEX', 'INCLUDES', 'ISPICKVAL', 'HYPERLINK', 'IMAGE', 'BR', 'MOD', 'ABS',
                     'CEILING', 'FLOOR', 'ROUND', 'SQRT', 'MAX', 'MIN', 'BLANKVALUE', 'NULLVALUE'];

    const fields = matches.filter(match => {
      const upperMatch = match.toUpperCase();
      return !keywords.includes(upperMatch);
    });

    // Remove duplicates
    return [...new Set(fields)];
  }

  /**
   * Test a validation rule formula against sample data
   * Note: This is a client-side simulation and may not be 100% accurate
   * @param {string} formula - The ErrorConditionFormula
   * @param {object} record - Sample record data
   * @returns {object} Test result with pass/fail and explanation
   */
  static testFormula(formula, record) {
    try {
      // This is a simplified formula evaluator
      // For production, you'd want to use Salesforce's formula evaluation API

      // Replace field references with values
      let evaluatedFormula = formula;

      // Get all field references
      const fields = this.parseFormulaFields(formula);

      // Replace field references with actual values
      for (const field of fields) {
        const value = this.getFieldValue(record, field);

        // Handle different value types
        if (value === null || value === undefined) {
          evaluatedFormula = evaluatedFormula.replace(new RegExp(this.escapeRegex(field), 'g'), 'null');
        } else if (typeof value === 'string') {
          evaluatedFormula = evaluatedFormula.replace(new RegExp(this.escapeRegex(field), 'g'), `"${value}"`);
        } else if (typeof value === 'boolean') {
          evaluatedFormula = evaluatedFormula.replace(new RegExp(this.escapeRegex(field), 'g'), value.toString());
        } else {
          evaluatedFormula = evaluatedFormula.replace(new RegExp(this.escapeRegex(field), 'g'), value);
        }
      }

      // Return the result
      return {
        tested: true,
        formula: formula,
        evaluatedFormula: evaluatedFormula,
        fieldsUsed: fields,
        message: 'Formula parsed successfully. Server-side evaluation recommended for accuracy.'
      };
    } catch (error) {
      console.error('[ValidationRuleAPI] Error testing formula:', error);
      return {
        tested: false,
        error: error.message
      };
    }
  }

  /**
   * Get a nested field value from a record
   * @param {object} record - The record object
   * @param {string} fieldPath - Field path (e.g., 'Account.Name' or 'Status')
   * @returns {any} The field value
   */
  static getFieldValue(record, fieldPath) {
    const parts = fieldPath.split('.');
    let value = record;

    for (const part of parts) {
      if (value === null || value === undefined) return null;
      value = value[part];
    }

    return value;
  }

  /**
   * Escape special regex characters
   * @param {string} string - The string to escape
   * @returns {string} Escaped string
   */
  static escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Format validation rule for display
   * @param {object} rule - Raw validation rule record from API
   * @returns {object} Formatted validation rule object
   */
  static formatRule(rule) {
    // Extract formula from Metadata compound field if available
    const formula = rule.Metadata?.errorConditionFormula || '';

    // Use ObjectLabel and ObjectApiName if available (from getValidationRules enrichment)
    // Otherwise fall back to EntityDefinition relationship or EntityDefinitionId
    const objectName = rule.ObjectApiName || rule.EntityDefinition?.QualifiedApiName || rule.EntityDefinitionId || 'Unknown';
    const objectLabel = rule.ObjectLabel || rule.EntityDefinition?.Label || rule.EntityDefinitionId || 'Unknown';

    return {
      id: rule.Id,
      name: rule.ValidationName,
      fullName: rule.FullName,
      active: rule.Active,
      object: objectName,
      objectLabel: objectLabel,
      description: rule.Description || '',
      formula: formula,
      errorField: rule.ErrorDisplayField || '',
      errorMessage: rule.ErrorMessage || '',
      namespace: rule.NamespacePrefix || '',
      isManaged: rule.ManageableState === 'installed',
      createdDate: rule.CreatedDate,
      lastModifiedDate: rule.LastModifiedDate,
      lastModifiedBy: rule.LastModifiedById || 'Unknown',
      fieldsReferenced: formula ? this.parseFormulaFields(formula) : []
    };
  }

  /**
   * Get status color class for UI
   * @param {boolean} active - Rule active status
   * @returns {string} CSS color class
   */
  static getStatusColor(active) {
    return active ? 'status-active' : 'status-inactive';
  }

  /**
   * Get status icon
   * @param {boolean} active - Rule active status
   * @returns {string} Material icon name
   */
  static getStatusIcon(active) {
    return active ? 'check_circle' : 'cancel';
  }

  /**
   * Analyze validation rules for potential issues
   * @param {Array} rules - Array of validation rule records
   * @returns {object} Analysis results
   */
  static analyzeRules(rules) {
    const analysis = {
      totalRules: rules.length,
      activeRules: 0,
      inactiveRules: 0,
      managedRules: 0,
      rulesWithNoDescription: 0,
      rulesWithLongFormulas: 0,
      objectCoverage: {},
      warnings: []
    };

    rules.forEach(rule => {
      // Count active/inactive
      if (rule.Active) {
        analysis.activeRules++;
      } else {
        analysis.inactiveRules++;
      }

      // Count managed
      if (rule.ManageableState === 'installed') {
        analysis.managedRules++;
      }

      // Check for missing description
      const description = rule.Description || '';
      if (!description || description.trim() === '') {
        analysis.rulesWithNoDescription++;
      }

      // Check formula length (complex formulas may need review)
      // Note: Formula is only available if Metadata was fetched
      const formula = rule.Metadata?.errorConditionFormula || '';
      if (formula && formula.length > 2000) {
        analysis.rulesWithLongFormulas++;
      }

      // Track object coverage
      const objectName = rule.EntityDefinition?.QualifiedApiName || rule.EntityDefinitionId || 'Unknown';
      if (!analysis.objectCoverage[objectName]) {
        analysis.objectCoverage[objectName] = { total: 0, active: 0 };
      }
      analysis.objectCoverage[objectName].total++;
      if (rule.Active) {
        analysis.objectCoverage[objectName].active++;
      }
    });

    // Generate warnings
    if (analysis.rulesWithNoDescription > 0) {
      analysis.warnings.push(`${analysis.rulesWithNoDescription} rules have no description`);
    }
    if (analysis.rulesWithLongFormulas > 0) {
      analysis.warnings.push(`${analysis.rulesWithLongFormulas} rules have complex formulas (>2000 chars)`);
    }
    if (analysis.inactiveRules > analysis.activeRules) {
      analysis.warnings.push('More inactive rules than active - consider cleanup');
    }

    return analysis;
  }
}

export default ValidationRuleAPI;

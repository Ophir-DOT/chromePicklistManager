/**
 * Picklist Mapper Utilities
 * Handles picklist value mapping between source and target orgs
 */

const PicklistMapper = {

  /**
   * Detect picklist fields from field metadata
   * @param {Array} sourceFields - Source field metadata
   * @param {Array} targetFields - Target field metadata
   * @returns {Array} Array of picklist field mappings
   */
  detectPicklistFields(sourceFields, targetFields) {
    const picklistFields = [];

    // Create target field lookup
    const targetFieldMap = {};
    targetFields.forEach(field => {
      targetFieldMap[field.name] = field;
    });

    // Find picklist fields that exist in both orgs
    sourceFields.forEach(sourceField => {
      if (sourceField.type === 'picklist' || sourceField.type === 'multipicklist') {
        const targetField = targetFieldMap[sourceField.name];

        if (targetField && (targetField.type === 'picklist' || targetField.type === 'multipicklist')) {
          picklistFields.push({
            name: sourceField.name,
            label: sourceField.label,
            type: sourceField.type,
            sourceValues: this.extractPicklistValues(sourceField),
            targetValues: this.extractPicklistValues(targetField)
          });
        }
      }
    });

    return picklistFields;
  },

  /**
   * Extract picklist values from field metadata
   * @param {Object} field - Field metadata
   * @returns {Array} Array of picklist values
   */
  extractPicklistValues(field) {
    if (!field.picklistValues) {
      return [];
    }

    return field.picklistValues
      .filter(pv => pv.active)
      .map(pv => ({
        value: pv.value,
        label: pv.label,
        default: pv.defaultValue || false
      }));
  },

  /**
   * Build picklist value mapping
   * @param {Array} sourceValues - Source picklist values
   * @param {Array} targetValues - Target picklist values
   * @returns {Object} Mapping result with suggestions
   */
  buildPicklistMapping(sourceValues, targetValues) {
    const mapping = {
      exactMatches: [],
      missingInTarget: [],
      additionalInTarget: [],
      valueMap: {} // sourceValue -> targetValue
    };

    // Create target value lookup
    const targetValueMap = {};
    targetValues.forEach(value => {
      targetValueMap[value.value] = value;
    });

    // Analyze source values
    sourceValues.forEach(sourceValue => {
      const targetValue = targetValueMap[sourceValue.value];

      if (targetValue) {
        // Exact match found
        mapping.exactMatches.push({
          sourceValue: sourceValue.value,
          targetValue: targetValue.value,
          label: sourceValue.label
        });
        mapping.valueMap[sourceValue.value] = targetValue.value;

        // Remove from target map
        delete targetValueMap[sourceValue.value];
      } else {
        // Value missing in target
        mapping.missingInTarget.push({
          value: sourceValue.value,
          label: sourceValue.label,
          default: sourceValue.default
        });
      }
    });

    // Find additional values in target
    Object.values(targetValueMap).forEach(value => {
      mapping.additionalInTarget.push({
        value: value.value,
        label: value.label
      });
    });

    return mapping;
  },

  /**
   * Get picklist values from Salesforce
   * @param {Object} session - Salesforce session
   * @param {string} objectName - Object API name
   * @param {string} fieldName - Field API name
   * @returns {Promise<Array>} Array of picklist values
   */
  async getPicklistValues(session, objectName, fieldName) {
    try {
      const endpoint = `${session.instanceUrl}/services/data/v59.0/sobjects/${objectName}/describe`;

      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${session.sessionId}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to describe ${objectName}: ${response.status}`);
      }

      const describe = await response.json();
      const field = describe.fields.find(f => f.name === fieldName);

      if (!field) {
        throw new Error(`Field ${fieldName} not found on ${objectName}`);
      }

      return this.extractPicklistValues(field);

    } catch (error) {
      console.error('[PicklistMapper] Error getting picklist values:', error);
      throw error;
    }
  },

  /**
   * Validate picklist mapping
   * @param {Object} picklistMapping - Picklist mapping configuration
   * @param {string} fieldName - Field name
   * @returns {Object} Validation result
   */
  validatePicklistMapping(picklistMapping, fieldName) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check for missing values
    if (picklistMapping.missingInTarget.length > 0) {
      picklistMapping.missingInTarget.forEach(value => {
        if (value.default) {
          validation.errors.push(`Default picklist value "${value.label}" (${value.value}) is missing in target org for field ${fieldName}`);
          validation.valid = false;
        } else {
          validation.warnings.push(`Picklist value "${value.label}" (${value.value}) is missing in target org for field ${fieldName}`);
        }
      });
    }

    return validation;
  },

  /**
   * Apply picklist mapping to a record
   * @param {Object} record - Source record
   * @param {Object} picklistMappings - Picklist field mappings (fieldName -> valueMap)
   * @returns {Object} Mapped record
   */
  mapPicklistValues(record, picklistMappings) {
    const mappedRecord = { ...record };

    Object.keys(picklistMappings).forEach(fieldName => {
      if (record[fieldName]) {
        const valueMap = picklistMappings[fieldName];
        const sourceValue = record[fieldName];

        // Handle multipicklist (semicolon-separated values)
        if (sourceValue.includes(';')) {
          const values = sourceValue.split(';');
          const mappedValues = values.map(v => valueMap[v] || v).join(';');
          mappedRecord[fieldName] = mappedValues;
        } else {
          // Single picklist value
          mappedRecord[fieldName] = valueMap[sourceValue] || sourceValue;
        }
      }
    });

    return mappedRecord;
  },

  /**
   * Generate picklist mapping report
   * @param {Array} picklistFields - Array of picklist field mappings
   * @returns {Object} Report summary
   */
  generateMappingReport(picklistFields) {
    const report = {
      totalFields: picklistFields.length,
      fieldsWithMismatches: 0,
      totalMissingValues: 0,
      fields: []
    };

    picklistFields.forEach(field => {
      const fieldReport = {
        name: field.name,
        label: field.label,
        sourceValueCount: field.sourceValues.length,
        targetValueCount: field.targetValues.length,
        missingValues: []
      };

      // Build mapping for this field
      const mapping = this.buildPicklistMapping(field.sourceValues, field.targetValues);

      if (mapping.missingInTarget.length > 0) {
        report.fieldsWithMismatches++;
        report.totalMissingValues += mapping.missingInTarget.length;
        fieldReport.missingValues = mapping.missingInTarget;
      }

      report.fields.push(fieldReport);
    });

    return report;
  }
};

export default PicklistMapper;

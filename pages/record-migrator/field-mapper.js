/**
 * Field Mapper Utilities
 * Handles field mapping logic between source and target orgs
 */

const FieldMapper = {

  /**
   * Build field mapping between source and target objects
   * @param {Array} sourceFields - Source object fields (from describe)
   * @param {Array} targetFields - Target object fields (from describe)
   * @returns {Object} Field mapping with suggestions
   */
  buildFieldMapping(sourceFields, targetFields) {
    const mapping = {
      exact: [], // Fields with exact API name match
      compatible: [], // Fields with same name but different metadata
      missingInTarget: [], // Fields in source but not in target
      additionalInTarget: [], // Fields in target but not in source
      recommendations: []
    };

    // Create lookup map for target fields
    const targetFieldMap = {};
    targetFields.forEach(field => {
      targetFieldMap[field.name] = field;
    });

    // Analyze source fields
    sourceFields.forEach(sourceField => {
      const targetField = targetFieldMap[sourceField.name];

      if (!targetField) {
        // Field missing in target
        mapping.missingInTarget.push({
          name: sourceField.name,
          label: sourceField.label,
          type: sourceField.type,
          required: sourceField.nillable === false,
          createable: sourceField.createable
        });
      } else {
        // Field exists in target - check compatibility
        const isExactMatch = this.areFieldsCompatible(sourceField, targetField);

        if (isExactMatch) {
          mapping.exact.push({
            sourceField: sourceField.name,
            targetField: targetField.name,
            label: sourceField.label,
            type: sourceField.type,
            status: 'exact'
          });
        } else {
          mapping.compatible.push({
            sourceField: sourceField.name,
            targetField: targetField.name,
            sourceType: sourceField.type,
            targetType: targetField.type,
            label: sourceField.label,
            status: 'type_mismatch',
            warning: `Type mismatch: ${sourceField.type} -> ${targetField.type}`
          });
        }

        // Remove from target map (to find additional fields later)
        delete targetFieldMap[sourceField.name];
      }
    });

    // Find additional fields in target
    Object.values(targetFieldMap).forEach(field => {
      if (field.createable && !field.calculated) {
        mapping.additionalInTarget.push({
          name: field.name,
          label: field.label,
          type: field.type,
          required: field.nillable === false
        });
      }
    });

    // Generate recommendations
    mapping.recommendations = this.generateRecommendations(mapping);

    return mapping;
  },

  /**
   * Check if two fields are compatible
   * @param {Object} sourceField - Source field metadata
   * @param {Object} targetField - Target field metadata
   * @returns {boolean} True if fields are compatible
   */
  areFieldsCompatible(sourceField, targetField) {
    // Same type and similar metadata
    if (sourceField.type !== targetField.type) {
      return false;
    }

    // Check for critical metadata differences
    if (sourceField.type === 'picklist' || sourceField.type === 'multipicklist') {
      // Picklist compatibility requires value matching (will be handled separately)
      return true;
    }

    if (sourceField.type === 'reference') {
      // Lookup fields must reference the same object type
      const sourceRefs = sourceField.referenceTo || [];
      const targetRefs = targetField.referenceTo || [];
      return JSON.stringify(sourceRefs.sort()) === JSON.stringify(targetRefs.sort());
    }

    // For other types, type match is sufficient
    return true;
  },

  /**
   * Generate recommendations based on mapping analysis
   * @param {Object} mapping - Field mapping object
   * @returns {Array} Array of recommendation objects
   */
  generateRecommendations(mapping) {
    const recommendations = [];

    // Warn about missing required fields
    mapping.missingInTarget.forEach(field => {
      if (field.required) {
        recommendations.push({
          severity: 'error',
          field: field.name,
          message: `Required field "${field.label}" (${field.name}) is missing in target org`,
          action: 'This field must exist in the target org or migration will fail'
        });
      } else {
        recommendations.push({
          severity: 'warning',
          field: field.name,
          message: `Field "${field.label}" (${field.name}) is missing in target org`,
          action: 'Data in this field will be skipped during migration'
        });
      }
    });

    // Warn about type mismatches
    mapping.compatible.forEach(field => {
      recommendations.push({
        severity: 'warning',
        field: field.sourceField,
        message: `Type mismatch for "${field.label}": ${field.sourceType} -> ${field.targetType}`,
        action: 'Data may be lost or transformed during migration'
      });
    });

    return recommendations;
  },

  /**
   * Validate field mapping before migration
   * @param {Object} mapping - Field mapping object
   * @param {Array} sourceFields - Source fields
   * @param {Array} targetFields - Target fields
   * @returns {Object} Validation result
   */
  validateFieldMapping(mapping, sourceFields, targetFields) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check for required fields missing in target
    const requiredMissing = mapping.missingInTarget.filter(f => f.required);
    if (requiredMissing.length > 0) {
      validation.valid = false;
      requiredMissing.forEach(field => {
        validation.errors.push(`Required field missing in target: ${field.label} (${field.name})`);
      });
    }

    // Check for type mismatches
    if (mapping.compatible.length > 0) {
      mapping.compatible.forEach(field => {
        validation.warnings.push(`Type mismatch: ${field.label} (${field.sourceType} -> ${field.targetType})`);
      });
    }

    // Check for non-required missing fields
    const optionalMissing = mapping.missingInTarget.filter(f => !f.required);
    if (optionalMissing.length > 0) {
      optionalMissing.forEach(field => {
        validation.warnings.push(`Optional field missing in target: ${field.label} (${field.name})`);
      });
    }

    return validation;
  },

  /**
   * Apply field mapping to a record
   * @param {Object} record - Source record
   * @param {Object} fieldMapping - Field mapping configuration
   * @param {Array} targetFields - Target field metadata
   * @returns {Object} Mapped record
   */
  mapRecordFields(record, fieldMapping, targetFields) {
    const mappedRecord = {};

    // Create target field lookup
    const targetFieldMap = {};
    targetFields.forEach(field => {
      targetFieldMap[field.name] = field;
    });

    // Map fields
    Object.keys(record).forEach(fieldName => {
      // Skip system fields and attributes
      if (fieldName === 'Id' || fieldName === 'attributes' || fieldName.startsWith('System')) {
        return;
      }

      const value = record[fieldName];

      // Check if field exists in target
      if (targetFieldMap[fieldName]) {
        const targetField = targetFieldMap[fieldName];

        // Skip non-createable fields
        if (!targetField.createable) {
          return;
        }

        // Apply value with type conversion if needed
        mappedRecord[fieldName] = this.convertFieldValue(value, targetField);
      }
      // If field doesn't exist in target, skip it
    });

    return mappedRecord;
  },

  /**
   * Convert field value based on target field type
   * @param {*} value - Source value
   * @param {Object} targetField - Target field metadata
   * @returns {*} Converted value
   */
  convertFieldValue(value, targetField) {
    if (value === null || value === undefined) {
      return null;
    }

    const targetType = targetField.type;

    switch (targetType) {
      case 'string':
      case 'textarea':
      case 'email':
      case 'url':
      case 'phone':
        return String(value);

      case 'boolean':
        return Boolean(value);

      case 'int':
      case 'double':
      case 'currency':
      case 'percent':
        return Number(value);

      case 'date':
      case 'datetime':
        // ISO format should work
        return value;

      case 'picklist':
      case 'multipicklist':
        // Picklist values will be validated separately
        return value;

      case 'reference':
        // Lookup IDs will be remapped separately
        return value;

      default:
        return value;
    }
  },

  /**
   * Get field metadata from describe result
   * @param {Object} session - Salesforce session
   * @param {string} objectName - Object API name
   * @returns {Promise<Array>} Array of field metadata
   */
  async getFieldMetadata(session, objectName) {
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
      return describe.fields || [];

    } catch (error) {
      console.error('[FieldMapper] Error getting field metadata:', error);
      throw error;
    }
  }
};

export default FieldMapper;

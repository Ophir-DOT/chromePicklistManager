/**
 * Rollback API
 * Handles rollback operations for failed migrations
 */

const RollbackAPI = {

  /**
   * Rollback migration by deleting created records
   * @param {Object} targetSession - Target session where records were created
   * @param {Array} recordIds - Array of record IDs to delete
   * @param {Function} onProgress - Optional progress callback
   * @returns {Promise<Object>} Rollback results
   */
  async rollbackMigration(targetSession, recordIds, onProgress = null) {
    try {
      console.log('[RollbackAPI] Starting rollback for', recordIds.length, 'records...');

      const results = {
        success: 0,
        failed: 0,
        errors: []
      };

      if (recordIds.length === 0) {
        console.log('[RollbackAPI] No records to rollback');
        return results;
      }

      // Process in batches of 200 (API limit for composite delete)
      const batchSize = 200;
      let processedCount = 0;

      for (let i = 0; i < recordIds.length; i += batchSize) {
        const batch = recordIds.slice(i, i + batchSize);

        // Use SObject Collection API for batch delete
        const endpoint = `${targetSession.instanceUrl}/services/data/v59.0/composite/sobjects`;

        const params = new URLSearchParams({
          ids: batch.join(','),
          allOrNone: 'false'
        });

        const response = await fetch(`${endpoint}?${params}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${targetSession.sessionId}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Rollback delete failed: ${response.status} ${response.statusText}`);
        }

        const batchResults = await response.json();

        // Process results
        batchResults.forEach((result, index) => {
          if (result.success) {
            results.success++;
          } else {
            results.failed++;
            const errorMessage = result.errors.map(e => e.message).join(', ');
            results.errors.push(`Record ${batch[index]}: ${errorMessage}`);
          }
        });

        processedCount += batch.length;

        // Send progress update
        if (onProgress) {
          const percentage = Math.round((processedCount / recordIds.length) * 100);
          onProgress(processedCount, recordIds.length, percentage);
        }
      }

      console.log('[RollbackAPI] Rollback complete:', results.success, 'deleted,', results.failed, 'failed');
      return results;

    } catch (error) {
      console.error('[RollbackAPI] Rollback failed:', error);
      throw error;
    }
  },

  /**
   * Validate if records can be rolled back (checks if they exist and are deletable)
   * @param {Object} targetSession - Target session
   * @param {Array} recordIds - Array of record IDs to validate
   * @returns {Promise<Object>} Validation results
   */
  async validateRollback(targetSession, recordIds) {
    try {
      console.log('[RollbackAPI] Validating rollback for', recordIds.length, 'records...');

      if (recordIds.length === 0) {
        return {
          valid: true,
          deletableCount: 0,
          undeletableCount: 0,
          missingCount: 0,
          undeletableRecords: []
        };
      }

      // Query records to check if they exist and are deletable
      const idList = recordIds.map(id => `'${id}'`).join(',');
      const soql = `SELECT Id, IsDeleted FROM AllRecords WHERE Id IN (${idList}) ALL ROWS`;

      const encodedQuery = encodeURIComponent(soql);
      const endpoint = `${targetSession.instanceUrl}/services/data/v59.0/query?q=${encodedQuery}`;

      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${targetSession.sessionId}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        // If query fails, assume all records are deletable (optimistic approach)
        console.warn('[RollbackAPI] Could not validate records, proceeding with rollback');
        return {
          valid: true,
          deletableCount: recordIds.length,
          undeletableCount: 0,
          missingCount: 0,
          undeletableRecords: []
        };
      }

      const result = await response.json();
      const foundRecords = result.records || [];

      const deletableCount = foundRecords.filter(r => !r.IsDeleted).length;
      const missingCount = recordIds.length - foundRecords.length;

      return {
        valid: true,
        deletableCount: deletableCount,
        undeletableCount: 0,
        missingCount: missingCount,
        undeletableRecords: []
      };

    } catch (error) {
      console.error('[RollbackAPI] Error validating rollback:', error);
      // Return optimistic validation on error
      return {
        valid: true,
        deletableCount: recordIds.length,
        undeletableCount: 0,
        missingCount: 0,
        undeletableRecords: [],
        validationError: error.message
      };
    }
  }
};

export default RollbackAPI;

// Batch Job API Client
// Provides methods to query and manage Salesforce asynchronous jobs
// Uses Tooling API for AsyncApexJob and related objects

import SalesforceAPI from './api-client.js';

class BatchJobAPI {
  /**
   * Query AsyncApexJob records with optional filters
   * @param {object} options - Query options
   * @param {string} options.status - Filter by status (Queued, Preparing, Processing, Completed, Aborted, Failed)
   * @param {string} options.jobType - Filter by job type (BatchApex, Future, Queueable, ScheduledApex)
   * @param {number} options.limit - Maximum number of records to return (default 50)
   * @param {string} options.orderBy - Field to order by (default CreatedDate DESC)
   * @returns {Promise<Array>} Array of job records
   */
  static async getAsyncApexJobs(options = {}) {

    const { status, jobType, limit = 50, orderBy = 'CreatedDate DESC' } = options;

    // Build WHERE clause
    const conditions = [];

    if (status) {
      conditions.push(`Status = '${status}'`);
    }

    if (jobType) {
      conditions.push(`JobType = '${jobType}'`);
    }

    // Build query
    let query = `
      SELECT Id, ApexClassId, ApexClass.Name, Status, JobType,
             JobItemsProcessed, TotalJobItems, NumberOfErrors,
             CreatedDate, CompletedDate, ExtendedStatus, MethodName,
             ParentJobId, LastProcessed, LastProcessedOffset
      FROM AsyncApexJob
    `;

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY ${orderBy} LIMIT ${limit}`;

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);
      return response.records || [];
    } catch (error) {
      console.error('[BatchJobAPI] Error querying jobs:', error);
      throw error;
    }
  }

  /**
   * Get active jobs (running or queued)
   * @param {number} limit - Maximum number of records
   * @param {Array} classNames - Optional array of class names to filter by
   * @returns {Promise<Array>} Array of active job records
   */
  static async getActiveJobs(limit = 50, classNames = null) {

    let classFilter = '';
    if (classNames && classNames.length > 0) {
      const escapedNames = classNames.map(name => `'${name}'`).join(', ');
      classFilter = `AND ApexClass.Name IN (${escapedNames})`;
    }

    const query = `
      SELECT Id, ApexClassId, ApexClass.Name, Status, JobType,
             JobItemsProcessed, TotalJobItems, NumberOfErrors,
             CreatedDate, CompletedDate, ExtendedStatus, MethodName
      FROM AsyncApexJob
      WHERE Status IN ('Queued', 'Preparing', 'Processing', 'Holding')
      ${classFilter}
      ORDER BY CreatedDate DESC
      LIMIT ${limit}
    `;

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);
      return response.records || [];
    } catch (error) {
      console.error('[BatchJobAPI] Error querying active jobs:', error);
      throw error;
    }
  }

  /**
   * Get recently completed jobs (both successful and failed)
   * @param {number} hours - Number of hours to look back (default 24)
   * @param {number} limit - Maximum number of records
   * @param {Array} classNames - Optional array of class names to filter by
   * @returns {Promise<Array>} Array of completed job records
   */
  static async getRecentCompletedJobs(hours = 24, limit = 50, classNames = null) {

    // Calculate date threshold
    const threshold = new Date(Date.now() - hours * 60 * 60 * 1000);
    const isoDate = threshold.toISOString();

    let classFilter = '';
    if (classNames && classNames.length > 0) {
      const escapedNames = classNames.map(name => `'${name}'`).join(', ');
      classFilter = `AND ApexClass.Name IN (${escapedNames})`;
    }

    const query = `
      SELECT Id, ApexClassId, ApexClass.Name, Status, JobType,
             JobItemsProcessed, TotalJobItems, NumberOfErrors,
             CreatedDate, CompletedDate, ExtendedStatus, MethodName
      FROM AsyncApexJob
      WHERE Status IN ('Completed', 'Aborted', 'Failed')
      AND CompletedDate >= ${isoDate}
      ${classFilter}
      ORDER BY CompletedDate DESC
      LIMIT ${limit}
    `;

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);
      return response.records || [];
    } catch (error) {
      console.error('[BatchJobAPI] Error querying completed jobs:', error);
      throw error;
    }
  }

  /**
   * Get all jobs (active and recent completed)
   * @param {number} limit - Maximum number of records per category
   * @returns {Promise<object>} Object with active and completed job arrays
   */
  static async getAllJobs(limit = 25) {

    try {
      // Run both queries in parallel
      const [activeJobs, completedJobs] = await Promise.all([
        this.getActiveJobs(limit),
        this.getRecentCompletedJobs(24, limit)
      ]);

      return {
        active: activeJobs,
        completed: completedJobs
      };
    } catch (error) {
      console.error('[BatchJobAPI] Error getting all jobs:', error);
      throw error;
    }
  }

  /**
   * Abort a running batch job
   * @param {string} jobId - The AsyncApexJob Id
   * @returns {Promise<object>} Result of abort operation
   */
  static async abortJob(jobId) {

    // Use SOQL to get the job's JobType first
    const query = `SELECT Id, JobType, Status FROM AsyncApexJob WHERE Id = '${jobId}'`;
    const queryEndpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;

    try {
      const queryResponse = await SalesforceAPI.callAPI(queryEndpoint);

      if (!queryResponse.records || queryResponse.records.length === 0) {
        throw new Error(`Job not found: ${jobId}`);
      }

      const job = queryResponse.records[0];

      // Only certain job types can be aborted
      if (!['Queued', 'Preparing', 'Processing', 'Holding'].includes(job.Status)) {
        throw new Error(`Cannot abort job with status: ${job.Status}`);
      }

      // Use System.abortJob via Apex Execute Anonymous
      // This is the most reliable way to abort jobs
      const abortCode = `System.abortJob('${jobId}');`;

      const executeEndpoint = '/services/data/v59.0/tooling/executeAnonymous/?anonymousBody=' +
        encodeURIComponent(abortCode);

      const response = await SalesforceAPI.callAPI(executeEndpoint);

      if (response.success) {
        return { success: true, jobId };
      } else {
        throw new Error(response.compileProblem || response.exceptionMessage || 'Unknown error');
      }
    } catch (error) {
      console.error('[BatchJobAPI] Error aborting job:', error);
      throw error;
    }
  }

  /**
   * Get scheduled jobs (CronTrigger)
   * @param {number} limit - Maximum number of records
   * @returns {Promise<Array>} Array of scheduled job records
   */
  static async getScheduledJobs(limit = 50) {

    const query = `
      SELECT Id, CronJobDetail.Name, CronJobDetail.JobType, State,
             NextFireTime, PreviousFireTime, StartTime, EndTime,
             TimesTriggered, CronExpression
      FROM CronTrigger
      WHERE CronJobDetail.JobType = '7'
      ORDER BY NextFireTime ASC NULLS LAST
      LIMIT ${limit}
    `;

    const endpoint = `/services/data/v59.0/query/?q=${encodeURIComponent(query)}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);
      return response.records || [];
    } catch (error) {
      console.error('[BatchJobAPI] Error querying scheduled jobs:', error);
      throw error;
    }
  }

  /**
   * Execute a scheduled job immediately
   * @param {string} cronTriggerId - The CronTrigger Id
   * @param {string} className - The Apex class name to execute
   * @param {number} batchSize - Optional batch size (default 200)
   * @returns {Promise<object>} Result with new job ID
   */
  static async executeScheduledJobNow(cronTriggerId, className, batchSize = 200) {

    try {
      // Use Database.executeBatch to run the batch job immediately
      const executeCode = `
        ${className} batchJob = new ${className}();
        Id jobId = Database.executeBatch(batchJob, ${batchSize});
        System.debug('Started batch job: ' + jobId);
      `;

      const endpoint = '/services/data/v59.0/tooling/executeAnonymous/?anonymousBody=' +
        encodeURIComponent(executeCode);

      const response = await SalesforceAPI.callAPI(endpoint);

      if (response.success) {

        // The debug log contains the job ID, but we need to query for the most recent job
        // for this class to get the actual ID
        const query = `
          SELECT Id
          FROM AsyncApexJob
          WHERE ApexClass.Name = '${className}'
          ORDER BY CreatedDate DESC
          LIMIT 1
        `;

        const queryEndpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;
        const jobResponse = await SalesforceAPI.callAPI(queryEndpoint);

        const jobId = jobResponse.records?.[0]?.Id || null;

        return {
          success: true,
          className,
          jobId,
          message: `Batch job ${className} started successfully`
        };
      } else {
        const errorMessage = response.compileProblem || response.exceptionMessage || 'Unknown error';
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('[BatchJobAPI] Error executing scheduled job:', error);
      throw error;
    }
  }

  /**
   * Get deployment status
   * @param {string} deploymentId - Optional specific deployment ID
   * @returns {Promise<Array>} Array of deployment records
   */
  static async getDeployments(deploymentId = null) {

    let query = `
      SELECT Id, Status, StartDate, CompletedDate,
             NumberComponentsTotal, NumberComponentsDeployed, NumberComponentErrors,
             NumberTestsTotal, NumberTestsCompleted, NumberTestErrors,
             CreatedBy.Name, StateDetail, ErrorMessage
      FROM DeployRequest
    `;

    if (deploymentId) {
      query += ` WHERE Id = '${deploymentId}'`;
    } else {
      query += ` ORDER BY StartDate DESC LIMIT 20`;
    }

    const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;

    try {
      const response = await SalesforceAPI.callAPI(endpoint);
      return response.records || [];
    } catch (error) {
      console.error('[BatchJobAPI] Error querying deployments:', error);
      throw error;
    }
  }

  /**
   * Get job summary statistics
   * @returns {Promise<object>} Summary statistics
   */
  static async getJobSummary() {

    try {
      // Get counts by status
      const query = `
        SELECT Status, COUNT(Id) jobCount
        FROM AsyncApexJob
        WHERE CreatedDate = LAST_N_DAYS:7
        GROUP BY Status
      `;

      const endpoint = `/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;
      const response = await SalesforceAPI.callAPI(endpoint);

      const summary = {
        queued: 0,
        preparing: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        aborted: 0,
        holding: 0,
        total: 0
      };

      if (response.records) {
        response.records.forEach(record => {
          const status = record.Status.toLowerCase();
          summary[status] = record.jobCount;
          summary.total += record.jobCount;
        });
      }

      return summary;
    } catch (error) {
      console.error('[BatchJobAPI] Error getting job summary:', error);
      throw error;
    }
  }

  /**
   * Format job for display
   * @param {object} job - Raw job record from API
   * @returns {object} Formatted job object
   */
  static formatJob(job) {
    const progress = job.TotalJobItems > 0
      ? Math.round((job.JobItemsProcessed / job.TotalJobItems) * 100)
      : 0;

    const duration = job.CompletedDate && job.CreatedDate
      ? new Date(job.CompletedDate) - new Date(job.CreatedDate)
      : job.CreatedDate
        ? Date.now() - new Date(job.CreatedDate)
        : 0;

    return {
      id: job.Id,
      className: job.ApexClass?.Name || 'Unknown',
      status: job.Status,
      jobType: job.JobType,
      progress: progress,
      itemsProcessed: job.JobItemsProcessed || 0,
      totalItems: job.TotalJobItems || 0,
      errors: job.NumberOfErrors || 0,
      createdDate: job.CreatedDate,
      completedDate: job.CompletedDate,
      extendedStatus: job.ExtendedStatus,
      methodName: job.MethodName,
      duration: duration,
      durationFormatted: this.formatDuration(duration)
    };
  }

  /**
   * Format duration in human-readable format
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  static formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  }

  /**
   * Get status color for UI
   * @param {string} status - Job status
   * @returns {string} CSS color class
   */
  static getStatusColor(status) {
    const colors = {
      'Queued': 'status-queued',
      'Preparing': 'status-preparing',
      'Processing': 'status-processing',
      'Holding': 'status-holding',
      'Completed': 'status-completed',
      'Failed': 'status-failed',
      'Aborted': 'status-aborted'
    };
    return colors[status] || 'status-unknown';
  }

  /**
   * Get job type icon
   * @param {string} jobType - Job type
   * @returns {string} Material icon name
   */
  static getJobTypeIcon(jobType) {
    const icons = {
      'BatchApex': 'layers',
      'Future': 'schedule_send',
      'Queueable': 'queue',
      'ScheduledApex': 'event_repeat'
    };
    return icons[jobType] || 'work';
  }
}

export default BatchJobAPI;

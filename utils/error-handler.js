class ErrorHandler {
  static handle(error, context = '') {
    console.error(`Error in ${context}:`, error);

    if (error.message.includes('INVALID_SESSION_ID')) {
      return {
        userMessage: 'Session expired. Please refresh Salesforce.',
        action: 'REFRESH_SESSION'
      };
    }

    if (error.message.includes('INSUFFICIENT_ACCESS')) {
      return {
        userMessage: 'Insufficient permissions to access this metadata.',
        action: 'CHECK_PERMISSIONS'
      };
    }

    if (error.message.includes('FIELD_INTEGRITY_EXCEPTION')) {
      return {
        userMessage: 'Cannot modify field: data exists that violates the new dependencies.',
        action: 'SHOW_DETAILS',
        details: error.message
      };
    }

    if (error.message.includes('No Salesforce session found')) {
      return {
        userMessage: 'Please log in to Salesforce first.',
        action: 'LOGIN_REQUIRED'
      };
    }

    return {
      userMessage: `Error: ${error.message}`,
      action: 'LOG_ERROR'
    };
  }

  static formatError(error) {
    const handled = this.handle(error);
    return handled.userMessage;
  }
}

export default ErrorHandler;

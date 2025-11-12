class Logger {
  static log(message, ...args) {
    console.log(`[Picklist Manager] ${message}`, ...args);
  }

  static error(message, ...args) {
    console.error(`[Picklist Manager] ERROR: ${message}`, ...args);
  }

  static warn(message, ...args) {
    console.warn(`[Picklist Manager] WARNING: ${message}`, ...args);
  }

  static info(message, ...args) {
    console.info(`[Picklist Manager] INFO: ${message}`, ...args);
  }

  static debug(message, ...args) {
    if (process.env.DEBUG) {
      console.debug(`[Picklist Manager] DEBUG: ${message}`, ...args);
    }
  }
}

export default Logger;

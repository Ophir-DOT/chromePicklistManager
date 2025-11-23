// Shared utility functions for security and data handling

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} unsafe - The string to escape
 * @returns {string} The escaped string
 */
export function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Escapes SOQL special characters to prevent SOQL injection
 * @param {string} value - The value to escape
 * @returns {string} The escaped value
 */
export function escapeSoql(value) {
  if (value === null || typeof value === 'undefined') return '';
  return String(value).replace(/'/g, "\'");
}

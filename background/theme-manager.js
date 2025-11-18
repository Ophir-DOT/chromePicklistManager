/**
 * Theme Manager - Handles light/dark mode theme switching
 * Follows system preference by default with manual override capability
 */

class ThemeManager {
  /**
   * Initialize theme on page load
   * Checks system preference and saved user preference
   */
  static async initTheme() {
    // Get saved theme preference from storage
    const result = await chrome.storage.local.get('themePreference');
    const savedTheme = result.themePreference; // 'light', 'dark', or 'system'

    if (savedTheme === 'system' || !savedTheme) {
      // Follow system preference
      this.applySystemTheme();
      this.listenToSystemChanges();
    } else {
      // Apply saved theme
      this.applyTheme(savedTheme);
    }
  }

  /**
   * Apply system theme based on prefers-color-scheme
   */
  static applySystemTheme() {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.applyTheme(isDark ? 'dark' : 'light');
  }

  /**
   * Listen to system theme changes
   */
  static listenToSystemChanges() {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

    darkModeQuery.addEventListener('change', async (e) => {
      // Only apply if user preference is 'system'
      const result = await chrome.storage.local.get('themePreference');
      if (result.themePreference === 'system' || !result.themePreference) {
        this.applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  /**
   * Apply theme to document
   * @param {string} theme - 'light' or 'dark'
   */
  static applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  /**
   * Set theme preference
   * @param {string} preference - 'light', 'dark', or 'system'
   */
  static async setThemePreference(preference) {
    // Save to storage
    await chrome.storage.local.set({ themePreference: preference });

    // Apply theme
    if (preference === 'system') {
      this.applySystemTheme();
    } else {
      this.applyTheme(preference);
    }
  }

  /**
   * Get current theme preference
   * @returns {Promise<string>} - 'light', 'dark', or 'system'
   */
  static async getThemePreference() {
    const result = await chrome.storage.local.get('themePreference');
    return result.themePreference || 'system';
  }

  /**
   * Get current active theme (actual applied theme)
   * @returns {string} - 'light' or 'dark'
   */
  static getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
}

export default ThemeManager;

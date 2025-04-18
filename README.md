# Obscure Extension (v1.6)

This browser extension allows you to visually hide specific web pages behind a simple 4-digit PIN prompt, **disguised as a "This site can't be reached" error page.**

**🔴 IMPORTANT NOTE: This extension provides visual obstruction only and is NOT a security tool. 🔴**

It is designed as a basic deterrent and can be **easily bypassed** by anyone familiar with browser developer tools (F12) or by simply disabling the extension in the browser settings. Do **NOT** use this to protect sensitive information or rely on it for any real security.

## Features

*   Hides the content of configured web pages on load.
*   **Displays a fake "This site can't be reached" error page instead of an explicit PIN prompt.**
*   Unlock by typing your 4-digit PIN anywhere on the fake error page and pressing Enter.
*   Allows setting the target URL pattern via an Options page (supports wildcards).
*   Uses SHA-256 hashing with a salt to store the PIN credential (the PIN itself is not stored).
*   Integrated PIN setup within an overlay for first-time use on a matched page.

## How It Works

1.  **Configuration:** Set a **Target URL Pattern** on the extension's options page (accessible via browser's extension management page or by clicking the extension icon). Use `*` as a wildcard (see options page for examples).
2.  **Page Load:** The extension checks if the current page's URL matches the saved pattern.
3.  **Hiding:** If it matches, the page content is immediately hidden.
4.  **PIN Storage Check:** It looks for a stored PIN hash and salt in the browser's local storage.
5.  **Overlay Display:**
    *   **No PIN Set:** Shows an overlay prompting you to create and confirm a 4-digit PIN. After setting the PIN, the page will reload.
    *   **PIN Already Set:** Shows a **fake "This site can't be reached" error page.**
6.  **PIN Setup:** When setting a PIN, a random salt is generated, combined with the PIN, and hashed (SHA-256). The hash and salt are stored.
7.  **PIN Verification (Hidden):** When the fake error page is shown, the extension listens for key presses. If you type 4 digits followed by the Enter key, it hashes the digits using the stored salt and compares against the stored hash. If they match, the fake error overlay is removed, revealing the page content. If incorrect, the input is ignored (you need to type 4 digits again).

## !!! Key Limitations !!!

*   🚨 **EASILY BYPASSABLE:** The overlay can be removed and page content revealed using browser developer tools (F12). Disabling the extension also removes the block.
*   🚨 **WEAK PIN:** 4 digits are inherently easy to guess or brute-force, even with hashing.
*   🚨 **NO SESSION PROTECTION:** This does **NOT** log you out or secure your website session. Bypassing the overlay grants full access to the page as if the extension wasn't there.
*   🚨 **POTENTIAL SITE CONFLICTS:** Injecting overlays might interfere with certain website layouts or scripts. Key listeners might conflict with page functionality if not handled carefully (though this implementation tries to minimize that).

## Recommended Secure Alternatives

For actual security needs:

1.  **Lock your Operating System:** `Win + L` (Windows), `Ctrl + Cmd + Q` (macOS), `Ctrl + Alt + L` (Linux).
2.  **Use a reputable Password Manager** with auto-lock features.
3.  **Log out** of websites when not in use.

## Setup Instructions

1.  Save all files (`manifest.json`, `content.js`, `style.css`, `options.html`, `options.js`, `README.md`) and the image `input_file_0.png` into a single folder.
2.  Create placeholder `icon48.png` and `icon128.png` files in the same folder (simple images will do).
3.  **Load the extension into your browser:**
    *   **Chrome/Edge:** Go to `chrome://extensions/`, enable "Developer mode", click "Load unpacked", and select the folder you created.
    *   **Firefox:** Go to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on...", and select the `manifest.json` file. (Note: Temporary add-ons are removed when Firefox closes).
4.  **Configure:** Click the extension icon in your browser toolbar (or go via the extensions management page) to open the Options. Enter the URL pattern for the site(s) you want to hide (e.g., `https://mail.google.com/*`) and save.
5.  Navigate to a URL matching the pattern.
    *   *First time:* It should prompt for PIN setup. Set your PIN. The page will reload.
    *   *Subsequent times:* It should show the fake "This site can't be reached" page. Type your 4-digit PIN and press Enter to reveal the actual page.
6.  **Remember the limitations described above.**

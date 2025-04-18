const urlPatternsInput = document.getElementById('url-patterns-input');
const saveButton = document.getElementById('save-button');
const statusDiv = document.getElementById('status');

// Storage Key
const TARGET_URL_KEY = 'pinHiderUrl';

// --- Function to convert pattern to Regex String (IMPROVED - Must match content.js) ---
function patternToRegexString(pattern) {
    if (!pattern) return '^$';

    let schemePart = '(?:https?|ftp|file)'; // Default scheme match
    let remainingPattern = pattern;
    let regexString = '';

    // 1. Handle Scheme
    if (remainingPattern.startsWith('*://')) {
        remainingPattern = remainingPattern.substring(4); // Remove '*://'
        regexString += schemePart + ':\\/\\/';
    } else if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(remainingPattern)) {
         // Match specific scheme like https://, ftp://, custom-app:// etc.
         const schemeMatch = remainingPattern.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
         if (schemeMatch) {
             schemePart = schemeMatch[1]; // Use the specific scheme
             remainingPattern = remainingPattern.substring(schemeMatch[0].length); // Remove 'scheme://'
             regexString += schemePart + ':\\/\\/';
         } else {
             // Should not happen if regex test passes, but as fallback treat rest literally
             console.warn("PIN Hider: Pattern scheme parsing failed unexpectedly for:", pattern);
             regexString += schemePart + ':\\/\\/'; // Use default and hope for the best
         }
    } else {
        // No scheme found - this pattern is likely invalid based on examples
        // Throw an error during validation in options.js, or handle as appropriate
        console.warn("PIN Hider: Pattern missing scheme:", pattern);
        // Let's allow it but it might not match as expected. Escape the whole thing?
        // For now, proceed assuming the rest is host/path.
        // Consider throwing: throw new Error("Pattern must start with a scheme (e.g., https:// or *://)");
        regexString += schemePart + ':\\/\\/'; // Assume default scheme needed
    }

    // 2. Handle Host Wildcard (*.) immediately after scheme
    if (remainingPattern.startsWith('*.')) {
        // Optional subdomain part: sequence of non-slashes/dots, followed by a dot
        regexString += '(?:[^\\/.]+\\.)?';
        remainingPattern = remainingPattern.substring(2); // Remove '*.'
    }

    // 3. Escape the rest of the pattern, converting '*' to '.*'
    let escapedRemaining = '';
    for (let i = 0; i < remainingPattern.length; i++) {
        const char = remainingPattern[i];
        if (char === '*') {
            escapedRemaining += '.*'; // Convert general wildcard
        } else if (/[.+?^${}()|[\]\\/]/.test(char)) {
            escapedRemaining += '\\' + char; // Escape regex metacharacters
        } else {
            escapedRemaining += char; // Keep literal characters
        }
    }

    regexString += escapedRemaining;

    // 4. Anchor the final regex
    const finalRegexString = '^' + regexString + '$';

    // 5. Test compilation during generation (important!)
    try {
        new RegExp(finalRegexString, 'i');
    } catch (e) {
        console.error(`PIN Hider: Failed to compile regex "${finalRegexString}" from pattern "${pattern}"`, e);
        // Re-throw specifically for the validation function in options.js
        throw new Error(`Invalid regex generated from pattern "${pattern}": ${e.message}`);
    }

    return finalRegexString;
}

// Load the saved patterns when the options page opens
async function loadOptions() {
  try {
    // Use chrome.storage.local.get with await for Manifest V3
    const data = await chrome.storage.local.get(TARGET_URL_KEY);
    // No need to check chrome.runtime.lastError with await

    let patterns = [];
    if (data && data[TARGET_URL_KEY]) {
        if (Array.isArray(data[TARGET_URL_KEY])) {
            patterns = data[TARGET_URL_KEY];
        } else if (typeof data[TARGET_URL_KEY] === 'string') {
            // Handle legacy single string format if necessary
            patterns = [data[TARGET_URL_KEY]];
            console.warn("PIN Hider Options: Loaded legacy single string pattern, converting to array.");
        }
    }
    // Join array elements with newline for display in textarea
    urlPatternsInput.value = patterns.join('\n');

  } catch (error) {
     console.error("Error loading options:", error);
     statusDiv.textContent = "Error loading settings.";
     statusDiv.style.color = 'red';
  }
}

// Save the patterns
async function saveOptions() {
  const inputText = urlPatternsInput.value;
  const lines = inputText.split('\n');
  const validPatterns = [];
  let invalidPatternFound = false;

  statusDiv.textContent = ''; // Clear previous status
  statusDiv.style.color = 'green'; // Reset color

  for (const line of lines) {
      const pattern = line.trim();
      if (pattern) { // Ignore empty lines
          // Validate the pattern using the *exact same function* as content.js
          try {
              const regexString = patternToRegexString(pattern);
              new RegExp(regexString, 'i'); // Test regex compilation
              validPatterns.push(pattern); // Add valid pattern to array
              console.log("PIN Hider Options: Validated pattern:", pattern, "-> Regex:", regexString);
          } catch (e) {
              invalidPatternFound = true;
              // Provide a more specific error message if possible
              statusDiv.textContent = `Invalid syntax generated from pattern: "${pattern}". Check wildcards/syntax. Error: ${e.message}`;
              statusDiv.style.color = 'red';
              console.error("PIN Hider Options: Invalid regex pattern generated from pattern:", pattern, "Error:", e);
              break; // Stop processing on first invalid pattern
          }
      }
  }

  // Only save if all non-empty lines contained valid patterns
  if (!invalidPatternFound) {
      try {
          // Use await for chrome.storage.local.set
          await chrome.storage.local.set({ [TARGET_URL_KEY]: validPatterns });
          // No need to check chrome.runtime.lastError with await

          if (validPatterns.length > 0) {
              statusDiv.textContent = 'Patterns saved!';
          } else {
              statusDiv.textContent = 'Patterns cleared (no valid patterns entered).';
          }
          // Clear status message after a delay
          setTimeout(() => { statusDiv.textContent = ''; }, 2500);
      } catch (error) {
          console.error("Error saving options:", error);
          statusDiv.textContent = "Error saving settings.";
          statusDiv.style.color = 'red';
          if (error.message && error.message.toLowerCase().includes('quota')) {
              statusDiv.textContent = "Error: Storage quota exceeded.";
          }
      }
  }
}

document.addEventListener('DOMContentLoaded', loadOptions);
saveButton.addEventListener('click', saveOptions);

// Optional: Save on Ctrl+Enter or Cmd+Enter in the textarea
urlPatternsInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        saveOptions();
    }
});
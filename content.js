// === content.js (Revised: document_start, visibility:hidden, Shadow DOM, rAF population) ===
(async () => { // Outer async wrapper

  // --- Storage Keys ---
  const PIN_HASH_KEY = 'pinHiderPinHash';
  const PIN_SALT_KEY = 'pinHiderPinSalt';
  const TARGET_URL_KEY = 'pinHiderUrl';

  // --- State ---
  let digitBuffer = '';
  let keydownListenerActive = false;
  let pageIsObscured = false;
  let hostElement = null; // The element hosting the shadow DOM
  let shadowRoot = null; // The shadow root itself

  // --- Helper Functions ---

  // Convert ArrayBuffer to Hex String
  function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Convert Hex String to Uint8Array
  function hexToUint8Array(hexString) {
    if (hexString.length % 2 !== 0) throw "Invalid hexString length";
    const arrayBuffer = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
      const byteValue = parseInt(hexString.substr(i, 2), 16);
      if (isNaN(byteValue)) throw "Invalid hex character";
      arrayBuffer[i / 2] = byteValue;
    }
    return arrayBuffer;
  }

  // Hash PIN using SHA-256 with Salt
  async function hashPin(pin, salt) {
    const encoder = new TextEncoder();
    const pinData = encoder.encode(pin);
    const combinedData = new Uint8Array(salt.length + pinData.length);
    combinedData.set(salt, 0);
    combinedData.set(pinData, salt.length);
    const hashBuffer = await crypto.subtle.digest('SHA-256', combinedData);
    return bufferToHex(hashBuffer);
  }

  // Verify entered PIN against stored hash and salt
  async function verifyPin(enteredPin, saltHex, storedHashHex) {
    try {
        if (!saltHex || !storedHashHex) {
             console.error("PIN Hider: Missing salt or hash during verification input.");
             return false;
        }
        const salt = hexToUint8Array(saltHex);
        const enteredHashHex = await hashPin(enteredPin, salt);
        return enteredHashHex === storedHashHex;
    } catch (error) {
        console.error("PIN Hider: Verification Error:", error);
        return false;
    }
  }

  // Simple delay function
  function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Robust patternToRegexString function
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
        console.warn("PIN Hider: Pattern missing scheme:", pattern);
        // Proceed assuming the rest is host/path.
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

  // Check if current URL matches ANY target pattern
  async function isTargetPage() {
    const data = await chrome.storage.local.get(TARGET_URL_KEY);
    let patterns = [];
    if (data && data[TARGET_URL_KEY]) {
        if (Array.isArray(data[TARGET_URL_KEY])) {
            patterns = data[TARGET_URL_KEY];
        } else if (typeof data[TARGET_URL_KEY] === 'string') {
            patterns = [data[TARGET_URL_KEY]]; // Handle legacy single string
        }
    }
    if (patterns.length === 0) {
        // console.log("PIN Hider: No patterns configured.");
        return false;
    }
    const currentUrl = window.location.href;
    // console.log("PIN Hider: Checking URL:", currentUrl);
    for (const pattern of patterns) {
        if (!pattern) continue;
        try {
            const regexString = patternToRegexString(pattern);
            // console.log(`PIN Hider: Testing pattern "${pattern}" -> Regex "${regexString}"`);
            const regex = new RegExp(regexString, 'i'); // Case-insensitive matching
            if (regex.test(currentUrl)) {
                console.log(`PIN Hider: URL matched pattern "${pattern}" with regex "${regexString}"`);
                return true;
            }
        } catch (e) {
          console.error("PIN Hider: Invalid pattern encountered during matching:", pattern, "Error:", e);
        }
    }
    // console.log("PIN Hider: URL did not match any patterns.");
    return false;
  }
  // --- End Helper Functions ---

  // --- Styles (to be injected into Shadow DOM) ---
  const commonStyles = `
    :host { /* Style the host element itself */
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background-color: #f0f0f0; /* Default background */
        z-index: 2147483647; display: flex; justify-content: center; align-items: center;
        font-family: system-ui, sans-serif; opacity: 1 !important; pointer-events: auto !important;
        box-sizing: border-box; padding: 20px;
        /* Ensure host is visible even if parent is visibility:hidden */
        visibility: visible !important;
    }
    #pin-hider-box {
      background-color: #ffffff; padding: 30px 40px; border-radius: 8px;
      box-shadow: 0 5px 20px rgba(0, 0, 0, 0.25); text-align: center; border: 1px solid #ddd;
      min-width: 300px; max-width: 90%;
    }
    #pin-hider-box h3 { margin-top: 0; margin-bottom: 20px; color: #333; font-size: 1.4em; }
    #pin-hider-box p { color: #555; font-size: 0.9em; margin-top: 10px; margin-bottom: 10px; }
    #pin-hider-box input[type="password"] {
      padding: 10px; font-size: 1.8em; text-align: center; width: 150px;
      margin: 5px auto 15px auto; display: block; border: 1px solid #ccc; border-radius: 4px;
      letter-spacing: 0.3em; box-sizing: border-box; autocomplete: "new-password";
    }
    #pin-hider-box button {
      padding: 10px 25px; font-size: 1em; background-color: #007bff; color: white;
      border: none; border-radius: 4px; cursor: pointer; transition: background-color 0.2s ease;
      margin-top: 10px;
    }
    #pin-hider-box button:hover { background-color: #0056b3; }
    .pin-error-message { color: #dc3545; font-weight: bold; font-size: 0.9em; margin-top: 10px; min-height: 1.2em; }
    .pin-warning { font-size: 0.8em !important; color: #6c757d !important; margin-top: 25px !important; border-top: 1px solid #eee; padding-top: 15px; }
    #pin-hider-error-content-wrapper {
        width: 100%; height: 100%; display: flex; justify-content: center; align-items: center;
        text-align: center; background-color: #ffffff; /* White background for error page */
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
        color: #5f6368;
    }
    #pin-hider-error-content { max-width: 500px; padding: 20px; }
    #pin-hider-error-content h1 { font-size: 1.8em; color: #202124; font-weight: 500; margin-bottom: 15px; }
    #pin-hider-error-content p { font-size: 1em; line-height: 1.5; margin-bottom: 10px; }
    #pin-hider-error-content .error-code { font-size: 0.9em; color: #70757a; text-transform: uppercase; margin-top: 20px; }
    @keyframes shake {
      0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
      20%, 40%, 60%, 80% { transform: translateX(4px); }
    }
    .shake { animation: shake 0.3s ease-in-out; }
  `;

  // --- HTML Snippets ---
  const setupHTML = `
    <style>${commonStyles}</style>
    <div id="pin-hider-box">
       <div id="pin-setup-view" style="display: block;">
        <h3>Setup PIN for this page</h3>
        <p>Enter a 4-digit PIN:</p>
        <input type="password" id="pin-setup-pin1" maxlength="4" pattern="\\d{4}" inputmode="numeric" autocomplete="new-password" required>
        <p>Confirm PIN:</p>
        <input type="password" id="pin-setup-pin2" maxlength="4" pattern="\\d{4}" inputmode="numeric" autocomplete="new-password" required>
        <button id="pin-setup-submit">Set PIN</button>
        <p id="pin-setup-error" class="pin-error-message" style="display: none;"></p>
        <p class="pin-warning">Warning: This only hides the page visually and is easily bypassed. Do not use for sensitive data.</p>
      </div>
    </div>
  `;
  const fakeErrorHTML = `
    <style>${commonStyles}</style>
    <div id="pin-hider-error-content-wrapper">
        <div id="pin-hider-error-content">
          <h1>This site can't be reached</h1>
          <p>DNS address could not be found. Diagnosing the problem.</p>
          <p class="error-code">DNS_PROBE_POSSIBLE</p>
        </div>
    </div>
  `;

  // --- Main Logic ---
  // Script runs at document_start

  if (await isTargetPage()) {
    console.log("PIN Hider: Target page detected (document_start). Initializing obscuring process.");

    // 1. Immediately hide the page content using visibility:hidden
    document.documentElement.style.setProperty('visibility', 'hidden', 'important');
    pageIsObscured = true;
    console.log("PIN Hider: documentElement visibility set to hidden.");

    // 2. Create host element and attach Shadow DOM (immediately)
    hostElement = document.createElement('div');
    hostElement.id = 'pin-hider-host';
    // Ensure host itself is visible even if documentElement is hidden
    hostElement.style.setProperty('visibility', 'visible', 'important');

    // Append host to documentElement (body might not exist yet)
    if (document.documentElement) {
        document.documentElement.appendChild(hostElement);
        console.log("PIN Hider: Shadow DOM host element added to documentElement.");
        try {
            shadowRoot = hostElement.attachShadow({ mode: 'open' });
            console.log("PIN Hider: Shadow DOM attached.");
        } catch (e) {
            console.error("PIN Hider: Failed to attach Shadow DOM:", e);
            if(hostElement) hostElement.remove();
            // Restore visibility if shadow fails
            document.documentElement.style.removeProperty('visibility');
            pageIsObscured = false;
            return; // Stop execution
        }
    } else {
         console.error("PIN Hider: documentElement not found at document_start! Cannot add host.");
         // Cannot reliably restore visibility if documentElement is missing
         pageIsObscured = false;
         return; // Stop execution
    }


    // Function to remove overlay and restore page visibility
    const removeOverlay = () => {
        pageIsObscured = false;
        if (hostElement) {
             hostElement.remove();
             hostElement = null; shadowRoot = null;
             console.log("PIN Hider: Shadow DOM host removed.");
        } else { console.warn("PIN Hider: Tried to remove overlay host, but none found."); }

        if (keydownListenerActive) {
            document.removeEventListener('keydown', handleHiddenPinEntry, true);
            keydownListenerActive = false;
            console.log("PIN Hider: Keydown listener removed from document.");
        }
        // Restore visibility by removing the style property
        document.documentElement.style.removeProperty('visibility');
        console.log("PIN Hider: documentElement visibility restored.");
    };

    // Define handleHiddenPinEntry for the error overlay case
    const handleHiddenPinEntry = async (event) => {
         if (!pageIsObscured) return;
         if (event.key === 'Backspace') { digitBuffer = digitBuffer.slice(0, -1); return; }
         if (!/^\d$/.test(event.key) && event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey) { return; }
         event.preventDefault(); event.stopPropagation();
         if (event.key === 'Enter') {
             if (digitBuffer.length === 4) {
                 const currentData = await chrome.storage.local.get([PIN_HASH_KEY, PIN_SALT_KEY]);
                 const currentHash = currentData[PIN_HASH_KEY]; const currentSalt = currentData[PIN_SALT_KEY];
                 if (!currentHash || !currentSalt) { console.error("PIN Hider: PIN data missing during verification attempt."); digitBuffer = ''; return; }
                 const correct = await verifyPin(digitBuffer, currentSalt, currentHash);
                 if (correct) { console.log("PIN Hider: PIN correct."); removeOverlay(); }
                 else {
                     console.log("PIN Hider: Incorrect PIN entered.");
                     digitBuffer = '';
                     const contentToShake = shadowRoot ? shadowRoot.querySelector('#pin-hider-error-content') : null;
                     if (contentToShake && !contentToShake.classList.contains('shake')) {
                         contentToShake.classList.add('shake');
                         setTimeout(() => { if (contentToShake) contentToShake.classList.remove('shake'); }, 300);
                     }
                 }
             } else { digitBuffer = ''; }
         } else { digitBuffer = (digitBuffer + event.key).slice(-4); }
    };

    // 3. Retrieve stored PIN data
    const data = await chrome.storage.local.get([PIN_HASH_KEY, PIN_SALT_KEY]);
    const storedHash = data[PIN_HASH_KEY];
    const storedSalt = data[PIN_SALT_KEY];
    let isPinSet = !!storedHash && !!storedSalt;

    // 4. *** Use requestAnimationFrame to populate Shadow DOM ***
    requestAnimationFrame(async () => {
        console.log("PIN Hider: requestAnimationFrame callback triggered.");
        if (!shadowRoot) {
            console.error("PIN Hider: Shadow root not available in rAF callback.");
            removeOverlay(); // Attempt cleanup
            return;
        }

        if (isPinSet) {
            // --- Show Fake Error Page ---
            console.log("PIN Hider: PIN is set. Populating Shadow DOM with Fake Error Overlay (rAF).");
            try {
                if (hostElement) hostElement.style.backgroundColor = '#ffffff'; // Set host background for error page
                shadowRoot.innerHTML = fakeErrorHTML; // Inject HTML + Styles

                const errorContent = shadowRoot.querySelector('#pin-hider-error-content');
                if (!errorContent) throw new Error("Error content element not found in Shadow DOM.");
                console.log("PIN Hider: Error overlay content populated successfully.");

                // Attach listener to document for global key capture
                if (!keydownListenerActive) {
                    document.addEventListener('keydown', handleHiddenPinEntry, true); // Use capture phase
                    keydownListenerActive = true;
                    console.log("PIN Hider: Keydown listener added.");
                }
                digitBuffer = '';
            } catch (error) {
                console.error("PIN Hider: Error showing fake error overlay (rAF):", error);
                removeOverlay(); // Attempt cleanup
            }
        } else {
            // --- Show PIN Setup ---
            console.log("PIN Hider: PIN not set. Checking race condition (rAF)...");
            // Race condition check is less critical now but keep it
            const currentData = await chrome.storage.local.get([PIN_HASH_KEY, PIN_SALT_KEY]);
            if (currentData[PIN_HASH_KEY] && currentData[PIN_SALT_KEY]) {
                console.log("PIN Hider: Race condition detected (rAF)! Reloading.");
                 removeOverlay();
                 window.location.reload();
                 // No return needed here as we exit via reload
            } else {
                console.log("PIN Hider: No race condition. Populating Shadow DOM with Setup Overlay (rAF).");
                try {
                    if (hostElement) hostElement.style.backgroundColor = '#f0f0f0'; // Ensure default host background
                    shadowRoot.innerHTML = setupHTML; // Inject HTML + Styles
                    console.log("PIN Hider: setupHTML set in Shadow DOM (rAF).");

                    // Find elements within the shadow root
                    const setupBox = shadowRoot.querySelector('#pin-hider-box');
                    const setupPin1 = shadowRoot.querySelector('#pin-setup-pin1');
                    const setupPin2 = shadowRoot.querySelector('#pin-setup-pin2');
                    const setupButton = shadowRoot.querySelector('#pin-setup-submit');
                    const setupError = shadowRoot.querySelector('#pin-setup-error');

                    if (!setupBox || !setupPin1 || !setupPin2 || !setupButton || !setupError) {
                         console.error("PIN Hider: Failed to find setup elements in Shadow DOM (rAF).", {
                             setupBox: !!setupBox, setupPin1: !!setupPin1, setupPin2: !!setupPin2,
                             setupButton: !!setupButton, setupError: !!setupError
                         });
                        throw new Error("Setup elements not found in Shadow DOM (rAF).");
                    }
                    console.log("PIN Hider: All setup elements found successfully (rAF).");

                    // Define setup handler
                    const handleSetup = async () => {
                         const pin1 = setupPin1.value; const pin2 = setupPin2.value; setupError.style.display = 'none';
                         if (!/^\d{4}$/.test(pin1) || !/^\d{4}$/.test(pin2)) { setupError.textContent = "Both PINs must be exactly 4 digits."; setupError.style.display = 'block'; return; }
                         if (pin1 !== pin2) { setupError.textContent = "PINs do not match."; setupError.style.display = 'block'; setupPin2.value = ''; setupPin2.focus(); return; }
                         try {
                             const salt = crypto.getRandomValues(new Uint8Array(16)); const saltHex = bufferToHex(salt); const hashHex = await hashPin(pin1, salt);
                             await chrome.storage.local.set({ [PIN_HASH_KEY]: hashHex, [PIN_SALT_KEY]: saltHex });
                             console.log("PIN Hider: PIN setup complete. Reloading page.");
                             removeOverlay();
                             window.location.reload();
                         } catch (error) { console.error("PIN Hider: Error during PIN setup/storage:", error); setupError.textContent = "Error setting PIN."; setupError.style.display = 'block'; }
                     };

                     // Attach listeners to elements within shadow DOM
                     setupButton.addEventListener('click', handleSetup);
                     setupPin1.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); setupPin2.focus(); } else if (event.key !== 'Tab') { setupError.style.display = 'none'; } });
                     setupPin2.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSetup(); } else if (event.key !== 'Tab') { setupError.style.display = 'none'; } });
                     console.log("PIN Hider: Setup event listeners attached (rAF).");

                     // Focus using nested requestAnimationFrame
                     requestAnimationFrame(() => { // Nested rAF for focus
                          console.log("PIN Hider: Attempting focus on setupPin1 (nested rAF)...");
                          // Ensure element still exists before focusing
                          const pin1Element = shadowRoot?.querySelector('#pin-setup-pin1');
                          if (pin1Element) {
                              pin1Element.focus();
                              console.log("PIN Hider: Focus attempt complete.");
                          } else {
                              console.warn("PIN Hider: setupPin1 not found for focus in nested rAF.");
                          }
                     });

                } catch (error) {
                    console.error("PIN Hider: Error occurred during showSetupOverlay (rAF):", error);
                    removeOverlay(); // Attempt cleanup
                }
            }
        }
    }); // End requestAnimationFrame

  } else {
     // Not target page
     // console.log("PIN Hider: Not target page.");
  }

})(); // End async IIFE
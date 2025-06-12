Here's a plan for a user-triggered browser extension, compatible with Chrome (Manifest V3) and Firefox (WebExtensions API), that leverages the Gemini API for this task:

## Project: AI Autofill Pro (working title)

**Goal:** A user-triggered browser extension that intelligently auto-fills web forms using a user's stored personal information, leveraging Gemini Flash 2.5's reasoning capabilities to understand form structure and make smart filling decisions.

**Key Principles:**

1.  **User-Triggered:** No automatic background processing. The user explicitly initiates the autofill process.
2.  **Privacy-First:** User data is stored locally and sent to the Gemini API only when explicitly requested by the user for autofill, with clear data handling policies.
3.  **Cross-Browser Compatibility:** Designed for both Chrome (Manifest V3) and Firefox (WebExtensions API).
4.  **Robust Form Interaction:** Handles various input types, dropdowns, radio buttons, and checkboxes.
5.  **Intelligent Mapping:** Leverages LLM for semantic understanding of form fields and user data.

---

## I. Architecture & Components

The extension will primarily consist of:

1.  **Popup UI (HTML, CSS, JS):** The main interface displayed when the user clicks the extension icon.
    * **User Profile Management:** Allows users to input and manage their personal information (e.g., name, address, email, phone, etc.). This data should be stored securely (e.g., `chrome.storage.local` / `browser.storage.local`).
    * **Gemini API Key Input:** A field for users to enter their personal Gemini API key. This should be securely stored.
    * **"Autofill Now" Button:** Initiates the autofill process for the active tab.
    * **Status/Feedback:** Displays messages about the autofill process (e.g., "Analyzing form...", "Filling fields...", "Completed!").
2.  **Background Script (Service Worker for Chrome MV3, Background Script for Firefox):**
    * Handles long-running tasks, API calls to Gemini, and communication between the popup/options page and content script.
    * Listens for messages from the popup (e.g., "autofill_request").
    * Manages the Gemini API calls.
    * Responsible for injecting and communicating with the content script.
3.  **Content Script (JavaScript):**
    * Injected into the active webpage to interact with the DOM.
    * Reads form structure and data.
    * Receives instructions from the background script to fill fields.
    * Manipulates input, select, and other form elements.
4.  **Options Page (HTML, CSS, JS - Optional, but good for more settings):**
    * More persistent settings (e.g., default profile, advanced mapping rules, privacy settings).

---

## II. Data Flow & Logic

### A. User Profile Management (Popup/Options Page)

1.  **User Input:** Users enter their personal data (e.g., `First Name: John`, `Last Name: Doe`, `Email: john.doe@example.com`, `Address Line 1: 123 Main St`, `City: Anytown`, `State: CA`, `Zip: 90210`, `Phone: 555-123-4567`, `Gender: Male`, `Date of Birth: 1990-01-15`).
2.  **Local Storage:** This data is stored in `chrome.storage.local` (Chrome) or `browser.storage.local` (Firefox). This keeps the sensitive data on the user's machine.
3.  **API Key Storage:** The Gemini API key is also stored securely in local storage.

### B. User-Triggered Autofill Process

1.  **Click Extension Icon:** User clicks the browser extension icon.
2.  **Popup Displays:** The popup UI appears.
3.  **"Autofill Now" Click:** User clicks the "Autofill Now" button.
4.  **Popup to Background Script:** The popup sends a message to the background script, including:
    * The user's stored personal data.
    * The active tab ID.
    * The Gemini API key.
5.  **Background Script to Content Script (Phase 1: DOM Extraction):**
    * The background script injects the content script (if not already injected) into the active tab.
    * Sends a message to the content script asking it to extract form information.
6.  **Content Script (Phase 1: DOM Extraction):**
    * **DOM Traversal:** Iterates through the current webpage's DOM to find all relevant form elements (`<input>`, `<textarea>`, `<select>`, `<button>`, `<label>`).
    * **Feature Extraction per Field:** For each identified form element, it extracts:
        * `id` attribute
        * `name` attribute
        * `type` attribute (for inputs)
        * `placeholder` attribute
        * Associated `<label>` text (using `for` attribute or traversing parent/sibling nodes).
        * Any `aria-label` or `aria-labelledby` attributes.
        * Values for `<option>` tags within `<select>` elements.
        * Current value (if any).
        * Read-only/disabled status.
        * XPath or unique CSS Selector: Crucial for reliable element identification later. This is often the hardest part to make robust across arbitrary sites.
    * **Structure Representation:** Organizes this extracted data into a structured format (e.g., a JSON array of objects, each representing a form field).
    * **Content Script to Background Script:** Sends this structured form data back to the background script.
7.  **Background Script to Gemini API:**
    * Constructs a detailed prompt for Gemini Flash 2.5 using:
        * The structured form data from the content script.
        * The user's structured personal information.
        * **System Instruction:** "You are an AI assistant specialized in intelligently filling web forms. Your goal is to match user data to form fields, handle variations, and suggest precise values. Always use the provided tool definitions to output your actions."
        * **Tool Definitions (Function Calling):** Define functions that the LLM can "call" to represent actions:
            * `fill_text_input(xpath_or_selector: str, value: str, field_type: str)`: For `text`, `email`, `number`, `password`, `textarea`.
            * `select_dropdown_option(xpath_or_selector: str, value: str)`: For `<select>` elements.
            * `check_radio_or_checkbox(xpath_or_selector: str, checked: bool)`: For `radio` and `checkbox` types.
            * *(Optional)* `click_button(xpath_or_selector: str)`: For "Next" or "Submit" buttons, though initial version should focus on filling, not submitting.
        * **User Query:** "Based on the form elements provided and the user's information, generate a list of actions (tool calls) to fill out the form. Prioritize exact matches but use your general knowledge for semantic matching (e.g., 'Surname' for 'Last Name'). For dropdowns and radio buttons, pick the most appropriate option if a direct match isn't found, or infer a common default. Do not include actions for fields where you have no relevant user data."
    * Makes an API call to Gemini Flash 2.5 with this prompt and the user's Gemini API key.
8.  **Gemini API Response:** Gemini returns a JSON object containing the recommended tool calls (e.g., `[{ "tool_name": "fill_text_input", "args": { "xpath_or_selector": "/html/body/div[2]/form/input[1]", "value": "John", "field_type": "text"}}, ...]`).
9.  **Background Script to Content Script (Phase 2: Action Execution):**
    * The background script receives Gemini's response.
    * Validates the structure of the tool calls.
    * Sends these validated actions to the content script.
10. **Content Script (Phase 2: Action Execution):**
    * Receives the list of actions from the background script.
    * For each action:
        * Locates the element using the provided XPath or selector.
        * Performs the specified action (e.g., sets `element.value`, selects `option`, clicks `element`).
        * Visually highlights the filled fields for user review (e.g., a temporary green border).
    * Sends a "fill_complete" message back to the background script.
11. **Popup Updates:** The popup UI updates to "Autofill Complete! Please review."

---

## III. Cross-Browser Compatibility (Chrome MV3 & Firefox WebExtensions)

* **Manifest File:**
    * Chrome: `manifest.json` with `manifest_version: 3`.
    * Firefox: `manifest.json` with `manifest_version: 2` (currently, Firefox is transitioning to MV3, but MV2 is still widely supported and simpler for initial development).
    * Differences in permissions and background script registration will need conditional logic or separate manifest files.
* **API Differences:**
    * `chrome.*` vs. `browser.*`: Most WebExtension APIs are cross-compatible by using `browser.*` for Firefox and falling back to `chrome.*` for Chrome, or by using a polyfill.
    * **Background Script:** Chrome MV3 uses **Service Workers** (event-driven, non-persistent), while Firefox traditionally uses persistent background scripts. This is the biggest architectural difference.
        * **Chrome MV3:** Service workers run only when needed. State management might require `chrome.storage.local` or `IndexedDB`. No direct DOM access; all interaction must be via content scripts.
        * **Firefox MV2:** Persistent background scripts can hold state. Direct DOM access is also restricted, so content scripts are still needed.
* **Content Script Injection:** Both support `chrome.scripting.executeScript` (Chrome MV3) or `browser.tabs.executeScript` (Firefox).
* **Messaging:** `chrome.runtime.sendMessage`/`onMessage` and `browser.runtime.sendMessage`/`onMessage` are largely compatible.
* **Storage:** `chrome.storage.local` and `browser.storage.local` are compatible.

**Strategy for Cross-Browser:**

1.  **Develop for Firefox first (MV2):** Often more forgiving and allows for faster iteration.
2.  **Port to Chrome (MV3):** Address service worker non-persistence and `host_permissions` changes carefully. Use a build script to generate separate manifests and bundle for each.
3.  **Polyfills/Abstractions:** Use libraries or custom wrappers to abstract `chrome` vs. `browser` API differences.

---

## IV. Security & Privacy Considerations

* **User Data:**
    * **Local Storage:** All user personal information and API keys MUST be stored locally using `chrome.storage.local` (or `browser.storage.local`) which is isolated per extension. **Never store on a remote server.**
    * **Encryption (Optional but Recommended):** For highly sensitive data, consider encrypting user profiles within local storage using a user-provided passphrase, though this adds complexity.
    * **Ephemeral API Key Usage:** The API key is sent with each request to Gemini, but should not be persistently logged or exposed.
* **Gemini API Communication:**
    * **HTTPS Only:** All communication with the Gemini API must be over HTTPS.
    * **Minimizing Data Sent:** Only send the necessary DOM structure and user data to the LLM. Avoid sending entire page content unless absolutely necessary for context, and always filter out highly sensitive, non-form-related information.
    * **Data Usage Policy:** Clearly inform users that their form data and parts of the webpage DOM will be sent to Google's Gemini API for processing when they trigger autofill. Link to Google's AI privacy policies.
* **Permissions:**
    * **Least Privilege:** Request only the minimum necessary permissions in the `manifest.json`.
        * `activeTab`: Allows access to the current tab only when the user invokes the extension (e.g., clicks the icon), which is perfect for this user-triggered approach.
        * `storage`: For storing user profiles and API keys locally.
        * `scripting` (Chrome MV3) / `tabs` (Firefox): For injecting content scripts.
        * `host_permissions`: Specific URLs or `<all_urls>` for content script injection. `<all_urls>` is necessary for arbitrary forms, but users should be warned.
* **Content Script Security:**
    * **Isolation:** Content scripts run in an isolated world, preventing direct access to page JavaScript variables, but they can still interact with the DOM.
    * **Input Sanitization:** Any data retrieved from the webpage should be treated as untrusted. Ensure robust sanitization if any part of it is used to construct dynamic code or displayed in the extension UI.
* **Error Handling:** Implement robust error handling for API calls, network issues, and unexpected DOM structures.

---

## V. Development Stages

1.  **Phase 1: Core User Profile & Storage**
    * Create basic popup UI for adding/editing user profiles.
    * Implement `chrome.storage.local` / `browser.storage.local` for saving/loading profiles.
    * Implement Gemini API key input and storage.
    * **Cross-browser test:** Ensure storage and basic UI work on both Chrome and Firefox.

2.  **Phase 2: DOM Extraction (Content Script)**
    * Develop a content script to identify and extract relevant form elements (inputs, textareas, selects, labels, types, placeholders).
    * Focus on generating robust XPath/CSS selectors for each element.
    * Implement messaging from background script to content script to trigger extraction, and back to send data.
    * **Testing:** Test on various complex forms (different websites, different frameworks like React, Angular, plain HTML).

3.  **Phase 3: Gemini API Integration & LLM Prompting**
    * Set up background script to receive form data and user profile.
    * Craft initial Gemini Flash 2.5 prompt with tool definitions.
    * Implement API call to Gemini.
    * Parse Gemini's tool call response.
    * **Iterative Prompt Engineering:** This will be the most time-consuming part. Experiment with different prompt structures, examples, and system instructions to get reliable and intelligent autofill results from Gemini. Test edge cases (e.g., "M" vs. "Male", "USA" vs. "United States of America").

4.  **Phase 4: Form Filling (Content Script)**
    * Implement content script logic to receive Gemini's tool calls and execute them on the DOM.
    * Add visual feedback (e.g., temporary highlights) to filled fields.
    * **Testing:** Test filling on various forms, ensuring correct values are set for all field types.

5.  **Phase 5: User Experience & Refinements**
    * Add "Autofill Now" button to the popup.
    * Add loading states and success/error messages in the popup.
    * Implement an optional "Review & Confirm" step where the user can see suggested fills before they are applied.
    * Add a simple onboarding guide for users.

6.  **Phase 6: Cross-Browser Polish & Release**
    * Finalize manifest files for both Chrome MV3 and Firefox.
    * Address any remaining API compatibility issues.
    * Optimize performance (e.g., minimize content script footprint, handle large DOMs efficiently).
    * Write clear privacy policy and instructions for API key usage.
    * Prepare for submission to Chrome Web Store and Firefox Add-ons.

Here's a guide/spec on how to implement the AI Autofill Pro extension using this boilerplate, focusing on integration rather than rewriting the core logic from the previous plan.

## AI Autofill Pro: Implementation Guide with `chrome-extension-boilerplate-react-vite`

This guide outlines how to integrate the AI Autofill Pro logic into the provided boilerplate. We will leverage the boilerplate's structure for background scripts, content scripts, and popup UI, while adding our specific logic for form analysis, LLM interaction, and form filling.

**Boilerplate Overview:**

* **`src/pages/popup/`**: For the extension's primary popup UI (React application).
* **`src/pages/background/`**: For the Manifest V3 Service Worker (background script).
* **`src/pages/content/`**: For the content script injected into web pages.
* **`manifest.js`**: Where the `manifest.json` is generated (important for permissions and script registration).
* **Vite Configuration**: Handles building and HMR.

---

### I. Project Setup & Initial Configuration

1.  **Clone the Boilerplate:**
    ```bash
    git clone https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite.git
    cd chrome-extension-boilerplate-react-vite
    npm install # or yarn
    ```
2.  **Inspect `manifest.js`:**
    * Ensure `manifest_version: 3` for Chrome compatibility.
    * **Add necessary permissions:**
        * `"activeTab"`: Crucial for user-triggered interaction with the current tab.
        * `"storage"`: For storing user profiles and API keys.
        * `"scripting"`: For injecting the content script dynamically.
        * `"host_permissions": ["<all_urls>"]`: Required for the content script to run on any webpage to analyze forms. This is a sensitive permission, and users should be informed.
    * Verify `background.service_worker` points to `src/pages/background/index.js`.
    * Verify `content_scripts` are NOT automatically declared here. We will inject the content script dynamically using `chrome.scripting.executeScript`.

3.  **Clean up / Rename Boilerplate Components:**
    * Rename `src/pages/popup/App.jsx` to something more descriptive like `src/pages/popup/AutofillPopup.jsx`.
    * Adjust imports accordingly.
    * Remove any boilerplate example logic from `background` or `content` scripts that is not relevant to autofill.

---

### II. Core Components & Logic Integration

#### A. Popup UI (`src/pages/popup/AutofillPopup.jsx` and related)

This will be your main user interface.

1.  **User Profile Management:**
    * **State Management:** Use React `useState` and `useEffect` hooks for managing the form fields for user data (e.g., first name, last name, email, address components).
    * **Persistence:**
        * On component mount, load saved user data from `chrome.storage.local` using `chrome.storage.local.get()`.
        * On input changes, update local React state.
        * On a "Save Profile" button click, save the current state to `chrome.storage.local.set()`.
    * **UI Elements:** Input fields for each piece of user data, a "Save Profile" button, a "Clear Profile" button.
2.  **Gemini API Key Input:**
    * Dedicated input field for the user's Gemini API key.
    * Similarly, load and save this key to `chrome.storage.local`. Emphasize **never hardcoding** this key or bundling it with the extension.
3.  **"Autofill Now" Button:**
    * This is the trigger for the entire autofill process.
    * On click, it will:
        * Retrieve the current user profile and Gemini API key from local storage.
        * Send a message to the background service worker (`chrome.runtime.sendMessage`) with the type `AUTOFILL_REQUEST` and the payload containing the user data and API key.
        * Update the popup UI to show a "Loading..." or "Analyzing..." status.
4.  **Status and Feedback Display:**
    * A dedicated area (e.g., a `<div>`) to show messages like "Autofill Complete!", "Error: Invalid API Key", "Analyzing form...", "Please review the filled fields."
    * Use `useState` to manage the status message.
5.  **User Consent/Disclaimer:**
    * Prominently display a disclaimer about data being sent to Google's Gemini API for processing when autofill is triggered. Include a link to Google's privacy policy.

#### B. Background Service Worker (`src/pages/background/index.js`)

This script acts as the orchestrator and the bridge to the Gemini API.

1.  **Message Listener:**
    * Use `chrome.runtime.onMessage.addListener` to listen for messages from the popup and the content script.
    * **Handle `AUTOFILL_REQUEST` (from Popup):**
        * Extract `userData` and `geminiApiKey` from the message.
        * **Inject Content Script (if not already):** Use `chrome.scripting.executeScript` to inject `src/pages/content/index.js` into the active tab. The `target.tabId` will be available from the `sender.tab.id` or by querying `chrome.tabs.query({ active: true, currentWindow: true })`.
        * **Request Form Data:** Send a message to the newly injected content script (e.g., type `EXTRACT_FORM_DATA`).
    * **Handle `FORM_DATA_EXTRACTED` (from Content Script):**
        * Receive the `formStructure` (the structured JSON of form elements) from the content script.
        * **Gemini API Call:**
            * Construct the detailed prompt for Gemini Flash 2.5 (as described in the previous plan: system instruction, tool definitions, user query, form structure, user data).
            * Make the `fetch` request to the Gemini API endpoint using the `geminiApiKey`.
            * Implement robust `try-catch` blocks for API errors (network issues, invalid key, rate limits).
        * **Process Gemini Response:**
            * Parse the JSON response from Gemini.
            * Validate that the `tool_calls` array is present and correctly structured.
        * **Send Actions to Content Script:** Send a message to the content script (e.g., type `EXECUTE_ACTIONS`) with the array of `tool_calls` returned by Gemini.
    * **Handle `AUTOFILL_COMPLETE` / `AUTOFILL_ERROR` (from Content Script):**
        * Receive confirmation or error messages from the content script after filling.
        * Send a final message back to the popup (e.g., type `UPDATE_POPUP_STATUS`) to update its UI.

2.  **API Key Management:**
    * The API key is passed *through* the background script for the API call, but should never be logged or stored persistently by the background script itself. It's ephemeral for the API call.

3.  **Error Handling & Fallbacks:**
    * Implement robust error handling for network issues, API errors, and unexpected content script behavior.
    * Communicate errors back to the popup for user feedback.

#### C. Content Script (`src/pages/content/index.js`)

This script directly interacts with the webpage's DOM.

1.  **Message Listener:**
    * Use `chrome.runtime.onMessage.addListener` to listen for messages from the background service worker.
    * **Handle `EXTRACT_FORM_DATA`:**
        * **DOM Traversal & Extraction:**
            * Implement a function (e.g., `extractFormFields()`) that traverses the DOM.
            * Use `document.querySelectorAll('input, textarea, select, button')` to find relevant elements.
            * For each element:
                * Extract `id`, `name`, `type`, `placeholder`.
                * Crucially, find associated `<label>` text by checking `element.labels` or by looking for parent/sibling `<label>` elements.
                * For `<select>` elements, iterate through `<option>` tags to get their `value` and display text.
                * Generate a **reliable XPath or unique CSS Selector** for each interactive element. This is vital. Consider using a utility function that generates a stable selector (e.g., prioritizing `id`, then `name`, then a more robust XPath).
                * Structure this data into a clean JSON object for each field.
            * Filter out non-form-related buttons or irrelevant elements.
        * Send the `formStructure` JSON back to the background script (type `FORM_DATA_EXTRACTED`).
    * **Handle `EXECUTE_ACTIONS`:**
        * Receive the `tool_calls` array from the background script.
        * Iterate through each tool call.
        * **Locate Element:** Use `document.evaluate` (for XPath) or `document.querySelector` (for CSS selector) to find the target element.
        * **Execute Action:**
            * **`fill_text_input`:** Set `element.value = args.value`.
            * **`select_dropdown_option`:** Set `element.value = args.value` (assuming `value` matches an option's `value` attribute). Trigger `change` event manually if needed: `element.dispatchEvent(new Event('change', { bubbles: true }))`.
            * **`check_radio_or_checkbox`:** Set `element.checked = args.checked`. For radio buttons, clicking them is often more reliable: `element.click()`.
        * **Visual Feedback:** Add a temporary CSS class (e.g., `autofilled-highlight`) to the filled element to visually indicate to the user what was filled. Use `setTimeout` to remove the highlight after a few seconds.
        * Send a `AUTOFILL_COMPLETE` message to the background script after all actions are executed (or `AUTOFILL_ERROR` if an element isn't found).

---

### III. Development Workflow & Testing

1.  **Start Development Server:**
    ```bash
    npm run dev
    ```
    This will build the extension and provide HMR for `popup` changes.
2.  **Load Unpacked Extension:**
    * **Chrome:** Go to `chrome://extensions/`, enable "Developer mode," click "Load unpacked," and select the `dist` folder generated by Vite.
    * **Firefox:** Go to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on," and select the `manifest.json` file inside the `dist` folder. (Note: Firefox's temporary add-on won't persist across browser restarts, so you'll need to reload it frequently for testing.)
3.  **Iterative Testing:**
    * **Phase 1 (Popup & Storage):** Test saving/loading user data and API key in the popup.
    * **Phase 2 (DOM Extraction):** Open various complex websites. Trigger the `EXTRACT_FORM_DATA` message (initially via a dummy button in popup, or direct console command in background script). Inspect the `formStructure` logged by the content script to ensure it's accurate and robust. This is critical.
    * **Phase 3 (Gemini Integration):** Test the full roundtrip: Popup -> Background -> Gemini -> Background. Verify Gemini's response is structured correctly.
    * **Phase 4 (Form Filling):** Test filling various input types (text, email, password, number, date), dropdowns, radio buttons, and checkboxes on different websites. Pay attention to events (e.g., `change` events for React forms).
4.  **Debugging:**
    * **Popup:** Standard React DevTools, browser's console for the extension popup.
    * **Background Script:** Open `chrome://extensions/`, click "Service worker" link for your extension (or "Inspect" for Firefox background script).
    * **Content Script:** Open the developer tools of the *webpage* itself (F12). You'll see your content script's console logs there.

---

### IV. Cross-Browser Considerations (Chrome MV3 vs. Firefox WebExtensions)

The boilerplate primarily targets Chrome MV3. For full Firefox compatibility:

1.  **`manifest.js` (Conditional Generation):** You might need to adjust the `manifest.js` to generate a Manifest V2 for Firefox during its build step (Firefox is still in transition to MV3). This could involve:
    * Different `manifest_version`.
    * Potentially different `background` key (Firefox uses `scripts` array for persistent background pages, not `service_worker`).
    * Different `permissions` if necessary.
    * The boilerplate's `manifest.js` might have a way to handle this, or you may need to introduce a separate `manifest.firefox.js`.
2.  **API Compatibility:**
    * **`browser` vs. `chrome`:** For `chrome.storage`, `chrome.runtime`, `chrome.tabs`, etc., consider using a polyfill like `webextension-polyfill` or manually checking `if (typeof browser !== 'undefined')` to use `browser.storage` for Firefox and `chrome.storage` for Chrome.
    * **`chrome.scripting`:** This API is Chrome-specific (MV3). Firefox uses `browser.tabs.executeScript`. Your background script will need conditional logic or a wrapper for this.
    * **Service Worker vs. Persistent Background Script:** The boilerplate's service worker will work for Chrome. For Firefox, if you stick to MV2, the background script will be persistent. This doesn't affect your core logic too much, but be aware of state management differences.

---

This guide provides a detailed roadmap for integrating the AI Autofill Pro logic into the `chrome-extension-boilerplate-react-vite`. The key is to leverage the boilerplate's established structure for communication and rendering, while focusing your efforts on the core logic of DOM analysis, prompt engineering for Gemini, and precise form manipulation.
The `Jonghakseo/chrome-extension-boilerplate-react-vite` is an excellent choice as it provides a solid foundation with React, TypeScript, Vite, and is configured for Manifest V3, supporting both Chrome and Firefox (though Firefox's MV3 transition might require slight adjustments depending on its current state).

Here's a guide/spec for implementing the AI Autofill Pro extension using this boilerplate:

## Implementation Guide/Spec for AI Autofill Pro with `chrome-extension-boilerplate-react-vite`

This guide assumes you have cloned the boilerplate and have a basic understanding of its structure.

---

### 1. Project Setup & Initial Configuration

1.  **Clone the Boilerplate:**
    ```bash
    git clone https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite.git ai-autofill-pro
    cd ai-autofill-pro
    pnpm install # or yarn install / npm install
    ```

2.  **Update `package.json`:**
    * Change `name`, `description`, `version`, and `author` to reflect "AI Autofill Pro".

3.  **Update `manifest.ts` (or `manifest.json`):**
    * Locate `src/manifest.ts` (the boilerplate uses TypeScript for manifest generation, which is great).
    * **Name & Description:** Update `name` and `description`.
    * **Permissions:**
        * Add `storage` for local data storage.
        * Add `activeTab` for user-triggered interaction with the current tab.
        * Add `scripting` for injecting content scripts (Chrome MV3).
        * For Firefox, ensure `host_permissions` are correctly configured (e.g., `<all_urls>`). The boilerplate might handle this via `web_accessible_resources`.
        * Example snippet for `permissions` and `host_permissions` in `manifest.ts`:

        ```typescript
        // in src/manifest.ts
        export default defineManifest({
          // ... existing fields
          permissions: ['storage', 'activeTab', 'scripting'], // 'scripting' for Chrome MV3, 'tabs' for Firefox MV2
          host_permissions: ['<all_urls>'], // Necessary for content script to interact with any website
          // ...
          content_scripts: [
            {
              matches: ['<all_urls>'], // Inject content script on all URLs
              js: ['src/pages/content/index.ts'], // Ensure this path is correct for your content script
              run_at: 'document_idle', // Run when the DOM is mostly ready
            },
          ],
          // ...
        });
        ```

4.  **Remove Unused Boilerplate Code:**
    * Review `src/pages/newtab` and `src/pages/devtools` if they exist and are not needed for this extension, you can remove them and their corresponding entries in `manifest.ts`.

---

### 2. Core Components Implementation

#### A. Popup UI (`src/pages/popup`)

This is where the user will interact with the extension.

1.  **`src/pages/popup/Popup.tsx` (or similar main component):**
    * **Layout:** Use React components to create the UI.
    * **User Profiles/Data Input:**
        * Implement forms for users to input their personal data (Name, Email, Address components, etc.).
        * Use React state (e.g., `useState`) to manage form input.
        * Upon saving, use `chrome.storage.local.set` to persist data.
        * Load existing data using `chrome.storage.local.get` when the popup opens.
        * Example structure for stored data:
            ```json
            {
              "profiles": {
                "default": {
                  "firstName": "John",
                  "lastName": "Doe",
                  "email": "john.doe@example.com",
                  "address": {
                    "line1": "123 Main St",
                    "city": "Anytown",
                    "state": "CA",
                    "zip": "90210",
                    "country": "USA"
                  },
                  "phone": "555-123-4567"
pu                }
              },
              "geminiApiKey": "YOUR_API_KEY_HERE"
            }
            ```
    * **Gemini API Key Input:** A dedicated input field for the user's Gemini API key, stored alongside profiles.
    * **"Autofill Now" Button:**
        * Attach an `onClick` handler.
        * When clicked, retrieve the current active profile and Gemini API key from local storage.
        * Send a message to the **Background Script** to initiate the autofill process.
        * ```javascript
            // Inside Popup.tsx
            import { sendMessage } from '@src/shared/utils/messaging'; // Assuming a shared messaging utility

            const handleAutofill = async () => {
              // 1. Get current active tab ID
              const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
              if (!tab || !tab.id) {
                console.error('No active tab found.');
                return;
              }

              // 2. Retrieve user data and API key from storage
              const storedData = await chrome.storage.local.get(['profiles', 'geminiApiKey']);
              const currentProfile = storedData.profiles?.default; // Or allow user to select profile
              const geminiApiKey = storedData.geminiApiKey;

              if (!currentProfile || !geminiApiKey) {
                // Show error message to user in UI
                return;
              }

              // 3. Send message to background script
              sendMessage({
                type: 'AUTOFILL_REQUEST',
                payload: {
                  tabId: tab.id,
                  profile: currentProfile,
                  apiKey: geminiApiKey,
                },
              });

              // 4. Update UI to show "Autofilling..." status
            };

            // ... JSX for button
            <button onClick={handleAutofill}>Autofill Now</button>
            ```
    * **Status Display:** Add a React state variable to show messages like "Analyzing form...", "Filling fields...", "Autofill Complete!", or error messages.

#### B. Background Script (`src/pages/background/index.ts`)

This acts as the central orchestrator and API caller.

1.  **Message Listener:**
    * Listen for messages from the popup (`AUTOFILL_REQUEST`).
    * Listen for messages from the content script (`FORM_DATA_EXTRACTED`, `FILL_COMPLETE`).
    * ```typescript
        // in src/pages/background/index.ts
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          if (message.type === 'AUTOFILL_REQUEST') {
            handleAutofillRequest(message.payload);
            // Don't sendResponse immediately, as this is an async operation
            return true; // Indicates async response
          } else if (message.type === 'FORM_DATA_EXTRACTED') {
            handleFormDataExtracted(message.payload, sender.tab?.id);
          } else if (message.type === 'FILL_COMPLETE') {
            // Update popup UI via another message or direct state if possible
            // (e.g., using a state management library accessible to both popup and background)
          }
        });
        ```

2.  **`handleAutofillRequest` Function:**
    * Receives `tabId`, `profile`, and `apiKey` from the popup.
    * **Inject Content Script (if not already injected):** This is handled by the boilerplate's `content_scripts` in `manifest.ts`, but you might explicitly inject it if you want more control over *when* it runs beyond `document_idle`.
    * **Request DOM Extraction:** Sends a message to the content script in the target `tabId` to initiate DOM extraction.
        ```typescript
        // In background script, inside handleAutofillRequest
        async function handleAutofillRequest(payload: { tabId: number; profile: any; apiKey: string }) {
          try {
            // Send message to content script to extract form data
            await chrome.tabs.sendMessage(payload.tabId, { type: 'EXTRACT_FORM_DATA' });
            // Store payload for later use after content script sends form data
            // (since service workers are stateless, store in global variable or chrome.storage.session)
            // Example:
            // globalAutofillState[payload.tabId] = payload;
          } catch (error) {
            console.error('Failed to inject or communicate with content script:', error);
            // Send error back to popup
          }
        }
        ```

3.  **`handleFormDataExtracted` Function:**
    * Receives the `formData` (structured representation of form elements) from the content script.
    * **Gemini API Call:**
        * Construct the prompt for Gemini Flash 2.5.
            * Include `formData` and `profile`.
            * Define tool schemas (e.g., `fill_text_input`, `select_dropdown_option`, `check_radio_or_checkbox`).
            * Set `model` to `gemini-1.5-flash-latest` (or `gemini-1.5-flash`).
            * Use the `generationConfig` to specify `response_mime_type: "application/json"` and `response_schema` if you want a stricter output format from Gemini.
        * Use `fetch` to call the Gemini API. Ensure API key is in the `Authorization` header.
        * ```typescript
            // In background script, inside handleFormDataExtracted
            import { GoogleGenerativeAI } from '@google/generative-ai';
            // ... (ensure you have the @google/generative-ai package installed)

            async function handleFormDataExtracted(formData: any[], tabId: number) {
              const { profile, apiKey } = globalAutofillState[tabId]; // Retrieve stored payload

              const genAI = new GoogleGenerativeAI(apiKey);
              const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

              const prompt = `You are an AI assistant specialized in intelligently filling web forms.
              Here is the current state of the web page's form elements (including their unique selectors for interaction):
              ${JSON.stringify(formData, null, 2)}

              Here is the user's information:
              ${JSON.stringify(profile, null, 2)}

              Your goal is to fill out this form accurately using the provided user information.
              You have the following tools available:
              function fill_text_input(selector: string, value: string, field_type: string)
              function select_dropdown_option(selector: string, value: string)
              function check_radio_or_checkbox(selector: string, checked: boolean)

              Based on the form elements and user data, suggest the next action(s) to take using the available tools. Output your action(s) as a JSON array of tool calls.
              `;

              try {
                const result = await model.generateContent({
                  contents: [{ role: 'user', parts: [{ text: prompt }] }],
                  tools: [
                    {
                      functionDeclarations: [
                        {
                          name: 'fill_text_input',
                          parameters: {
                            type: 'object',
                            properties: {
                              selector: { type: 'string' },
                              value: { type: 'string' },
                              field_type: { type: 'string' },
                            },
                            required: ['selector', 'value', 'field_type'],
                          },
                        },
                        {
                          name: 'select_dropdown_option',
                          parameters: {
                            type: 'object',
                            properties: {
                              selector: { type: 'string' },
                              value: { type: 'string' },
                            },
                            required: ['selector', 'value'],
                          },
                        },
                        {
                          name: 'check_radio_or_checkbox',
                          parameters: {
                            type: 'object',
                            properties: {
                              selector: { type: 'string' },
                              checked: { type: 'boolean' },
                            },
                            required: ['selector', 'checked'],
                          },
                        },
                      ],
                    },
                  ],
                  // For stricter JSON output, you might leverage response_mime_type and response_schema in advanced cases
                  // Or simply rely on function calling output and parse it.
                });

                const response = result.response;
                const toolCalls = response.functionCalls(); // Assuming LLM provides function calls directly
                // If LLM output is a JSON string, parse it: JSON.parse(response.text())

                // Send tool calls to content script for execution
                await chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_ACTIONS', payload: toolCalls });

              } catch (error) {
                console.error('Gemini API call failed:', error);
                // Send error back to popup
              } finally {
                delete globalAutofillState[tabId]; // Clean up state
              }
            }
            ```
    * **Send Actions to Content Script:** Once Gemini returns the `toolCalls`, send them to the content script for execution.

#### C. Content Script (`src/pages/content/index.ts`)

This script interacts directly with the webpage DOM.

1.  **DOM Extraction Logic:**
    * Listen for `EXTRACT_FORM_DATA` message from the background script.
    * Implement functions to traverse the DOM and extract form elements.
    * **Crucial:** Generating stable and unique selectors. XPath is often more robust than simple CSS selectors for complex pages.
        * For each element, store its `tagName`, `type`, `id`, `name`, `placeholder`, `value`, text from associated `<label>`, `aria-label`, `aria-labelledby`, and most importantly, a unique **XPath** or highly specific CSS selector.
        * For `<select>` elements, include the `options` (text and value).
        * For `radio` and `checkbox` elements, identify their `value` and `checked` status. Group radio buttons by `name`.
    * Send the extracted structured data (`formData`) back to the background script using `chrome.runtime.sendMessage`.
    * ```typescript
        // in src/pages/content/index.ts
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          if (message.type === 'EXTRACT_FORM_DATA') {
            const formData = extractFormData(); // Implement this function
            chrome.runtime.sendMessage({ type: 'FORM_DATA_EXTRACTED', payload: formData });
            return true; // Indicates async response
          } else if (message.type === 'EXECUTE_ACTIONS') {
            executeActions(message.payload); // Implement this function
          }
        });

        function extractFormData() {
          const formElements: any[] = [];
          document.querySelectorAll('input, textarea, select').forEach(element => {
            const el = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            const data: any = {
              tagName: el.tagName.toLowerCase(),
              type: el.type || el.tagName.toLowerCase(), // 'input' type can be missing
              id: el.id,
              name: el.name,
              placeholder: el.placeholder,
              selector: getElementXPath(el) || getCssSelector(el), // Prioritize XPath, then CSS
              // Add label text, aria-labels, etc.
            };

            if (el.tagName.toLowerCase() === 'select') {
              data.options = Array.from((el as HTMLSelectElement).options).map(opt => ({
                text: opt.textContent,
                value: opt.value,
              }));
            }
            // Add specific logic for radio/checkbox groups if needed

            formElements.push(data);
          });
          return formElements;
        }

        // Helper function to get XPath (can be complex, use a robust library or implement carefully)
        // Example (simplified):
        function getElementXPath(element: Element): string {
          if (element.id !== '') return `//*[@id='${element.id}']`;
          if (element === document.body) return '/html/body';
          let ix = 0;
          const siblings = element.parentNode?.children || [];
          for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === element) return `${getElementXPath(element.parentNode!)}/${element.tagName.toLowerCase()}[${ix + 1}]`;
            if (sibling.nodeType === 1 && sibling.tagName === element.tagName) ix++;
          }
          return ''; // Fallback if no parent
        }
        // getCssSelector can also be implemented or use a library
        ```

2.  **Action Execution Logic:**
    * Listen for `EXECUTE_ACTIONS` message from the background script.
    * Implement `executeActions` function:
        * Iterate through the `payload` (Gemini's tool calls).
        * For each action, use the `selector` (XPath/CSS selector) to find the element on the page.
        * Perform the action (e.g., set `value`, `selectedIndex`, `checked` status).
        * Add visual feedback (e.g., `element.style.border = '2px solid green'`).
        * ```typescript
            // in src/pages/content/index.ts
            async function executeActions(actions: any[]) {
              for (const action of actions) {
                const { tool_name, args } = action;
                const element = document.evaluate(args.selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement | null;

                if (!element) {
                  console.warn(`Element not found for selector: ${args.selector}`);
                  continue;
                }

                if (tool_name === 'fill_text_input') {
                  (element as HTMLInputElement | HTMLTextAreaElement).value = args.value;
                } else if (tool_name === 'select_dropdown_option') {
                  (element as HTMLSelectElement).value = args.value;
                } else if (tool_name === 'check_radio_or_checkbox') {
                  (element as HTMLInputElement).checked = args.checked;
                  element.dispatchEvent(new Event('change', { bubbles: true })); // Trigger change event
                }
                // Add temporary visual feedback
                element.style.outline = '2px solid #4CAF50'; // Green outline
                element.style.transition = 'outline 0.3s ease-out';
                setTimeout(() => {
                  element.style.outline = 'none';
                }, 1500); // Remove highlight after 1.5 seconds
              }
              chrome.runtime.sendMessage({ type: 'FILL_COMPLETE' });
            }
            ```

---

### 3. Messaging Utilities (`src/shared/utils/messaging.ts` or similar)

Create a shared utility for sending and receiving messages between different parts of the extension. This helps abstract `chrome.runtime.sendMessage`, etc., and makes the code cleaner.

```typescript
// src/shared/utils/messaging.ts
export const sendMessage = async (message: any, tabId?: number) => {
  if (tabId) {
    // Send to specific tab (content script)
    await chrome.tabs.sendMessage(tabId, message);
  } else {
    // Send to background script (from popup) or other parts
    await chrome.runtime.sendMessage(message);
  }
};

export const onMessage = (callback: (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => boolean | void) => {
  chrome.runtime.onMessage.addListener(callback);
};
```
Adjust this based on the boilerplate's existing messaging pattern.

---

### 4. Manifest V3 Considerations

* **Service Worker (`background/index.ts`):** Remember that the background script is a Service Worker. It's event-driven and non-persistent. This means any state it needs to maintain across messages (like the `profile` and `apiKey` for a specific autofill request) must be stored (e.g., in `chrome.storage.session` for temporary state, or passed along in message payloads). For a single, sequential autofill request, passing the data in the `AUTOFILL_REQUEST` message and then to `handleFormDataExtracted` is often sufficient.
* **`host_permissions`:** Make sure `<all_urls>` is declared in `manifest.ts` under `host_permissions` for the content script to run on any website. This will prompt a warning to the user during installation.
* **Dynamic Content Script Injection (Optional):** While `content_scripts` in `manifest.ts` will auto-inject, for more control (e.g., injecting only when needed for performance), you could use `chrome.scripting.executeScript` from the background script. The boilerplate likely already sets up automatic injection, which is fine for this use case.

---

### 5. Error Handling & User Feedback

* **API Errors:** Gracefully handle failed Gemini API calls (network issues, invalid API key, rate limits). Display informative messages to the user in the popup.
* **Element Not Found:** If the content script cannot find an element based on Gemini's suggested selector, log a warning and proceed with other fields. This is crucial for arbitrary forms where selectors might vary.
* **Review Step:** Before truly "completing" the autofill, consider adding a confirmation step in the popup where the user can see a summary of what was filled and approve/deny the changes. This could involve sending the filled data back from the content script to the popup for display.

---

### 6. Development & Testing

* **Development Server:** Use `pnpm dev` (or `yarn dev` / `npm run dev`) to start the Vite development server.
* **Loading Unpacked Extension:**
    * Chrome: Go to `chrome://extensions`, enable Developer mode, click "Load unpacked," and select the `dist` folder generated by Vite.
    * Firefox: Go to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on," and select the `manifest.json` file inside the `dist` folder.
* **Debugging:**
    * Popup: Right-click the extension icon -> "Inspect popup".
    * Background Script (Service Worker): Go to `chrome://extensions`, find your extension, and click "Service Worker" (or "Inspect views background page" for Firefox).
    * Content Script: Open the target webpage, open DevTools (F12), and you'll see console logs/errors from your content script. You might need to select the content script's "context" in the DevTools console dropdown.
* **Iterative Testing:** Test on a variety of websites with different form structures to refine the DOM extraction logic and the LLM's prompt engineering.
# JobCopilot Chrome Extension

A lightweight Manifest V3 extension that injects your JobCopilot prefill session script into the currently active tab.

## Extension workflow

1. **Generate prefill session key in JobCopilot dashboard**
   - In JobCopilot (`/dashboard`), trigger the flow that creates a one-time prefill session.
   - Copy the returned session key.
2. **Open an employer application page**
   - Navigate to the job form tab where you want JobCopilot to prefill fields.
3. **Open the extension popup**
   - Click the JobCopilot extension icon.
4. **Provide configuration**
   - Enter your **App origin** (for example `http://localhost:3000` or your production JobCopilot URL).
   - Paste the **Prefill session key** from step 1.
5. **Run prefill**
   - Click **Run prefill**.
   - The extension injects a script into the active tab that requests:
     - `https://<your-origin>/api/prefill/session/<session-key>`
6. **Server-delivered script executes on the page**
   - The injected script fills supported form fields and applies any site-specific mapping logic.
7. **Rotate key when needed**
   - If the key expires or fails, generate a fresh key from dashboard and run again.

## What gets saved

The extension stores these values in `chrome.storage.sync`:

- `jobcopilotPrefillOrigin`
- `jobcopilotPrefillSessionKey`

This allows quick reuse across tabs and synced Chrome profiles.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `apps/chrome-extension`.

## Use (quick version)

1. Open the employer job-application page you want to prefill.
2. Click the extension icon.
3. Enter app origin + session key.
4. Click **Run prefill**.

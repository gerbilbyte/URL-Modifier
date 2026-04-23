# URL Modifier

A Firefox extension that intercepts and rewrites HTTP/HTTPS request URLs in real time using named regex rules — supporting before, replace, and after modes with live testing and JSON import/export.

WARNING! This code is 100% vibe coded using Claude, so use at your own risk. I've only tested this on Firefox for linux and Android and it seems to work pretty well. I'm not liable for any damages caused to data, Firefox exploding, physical melting of an android device from using this extension blah blah blah.

![License: PolyForm Noncommercial](https://img.shields.io/badge/License-PolyForm_NC_1.0-blue.svg)
![Firefox](https://img.shields.io/badge/Firefox-140%2B-orange?logo=firefox)
![Firefox Android](https://img.shields.io/badge/Firefox_Android-142%2B-orange?logo=firefox)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![Data Collection](https://img.shields.io/badge/Data_Collection-None-brightgreen)

---

## What it does

URL Modifier sits between Firefox and the network. Every HTTP and HTTPS request — pages, scripts, images, API calls, WebSockets — passes through your rules before it reaches the server. Each rule matches a pattern in the URL and applies your modification text, in one of three modes:

| Mode | Effect |
|---|---|
| **Before** | Inserts your text immediately before the matched pattern |
| **Replace** | Replaces the matched pattern with your text (supports `$1`, `$2` capture groups) |
| **After** | Appends your text immediately after the matched pattern |

Rules are applied top-to-bottom in order. Patterns are JavaScript regular expressions, with automatic fallback to literal string matching if the regex is invalid.

---

## Screenshots

> <img width="623" height="259" alt="image" src="https://github.com/user-attachments/assets/91a441de-c369-487d-90df-646f30914a90" />

> <img width="1083" height="464" alt="image" src="https://github.com/user-attachments/assets/e774f9ab-2808-4ad8-91ea-533c67a423b7" />

---

## Features

- **Real-time URL rewriting** — intercepts all request types: `main_frame`, `sub_frame`, `script`, `image`, `xmlhttprequest`, `websocket`, `media`, `beacon`, and more
- **Three-layer interception** — `webRequest.onBeforeRequest` + `webNavigation.onBeforeNavigate` + `tabs.onUpdated`, so even cold-start Intent URLs from external apps (e.g. Signal opening a link in Firefox) are always caught
- **Case-insensitive matching** — patterns match regardless of URL capitalisation
- **Regex or literal** — full JavaScript regex with capture group references, automatic literal fallback for invalid patterns
- **Enable / disable per rule** — toggle individual rules without deleting them
- **Live URL tester** — paste any URL and instantly see the rewritten result
- **Import / Export** — save and load your full rule set as a JSON file
- **Toolbar icon** — turns green when active, grey when inactive
- **Persistent state** — rules and active state survive browser restarts
- **No data collection** — all processing is local; nothing is sent anywhere

---

## Installation

### Firefox for Android (Fenix)

The following instructions are now invalid. The latest version can be found on the Mozilla Add-on page. Simply navigate to https://addons.mozilla.org/en-GB/firefox/addon/url-modifier-by-gerbil/

1. Download the latest signed `.xpi` from the [Releases](../../releases) page
2. Transfer it to your device (email, Google Drive, USB, etc.)
3. Open Firefox on Android, tap the address bar, and navigate to the file — or open it from a file manager
4. Tap **Add** when Firefox prompts

> **Note:** The extension requires Firefox for Android 142 or later. Unsigned `.xpi` files require Firefox Nightly. The signed release works on standard Firefox.

### Firefox Desktop (Windows / macOS / Linux)

The following instructions are now invalid. The latest version can be found on the Mozilla Add-on page. Simply navigate to https://addons.mozilla.org/en-GB/firefox/addon/url-modifier-by-gerbil/

**From a release (recommended):**
1. Download the signed `.xpi` from the [Releases](../../releases) page
2. In Firefox, go to `about:addons` → ⚙ gear icon → **Install Add-on From File…**
3. Select the `.xpi`

**Load unpacked (developer mode):**
1. Go to `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
2. Select `manifest.json` from the cloned repository
3. Active until Firefox restarts

### Chrome / Edge / Brave / Opera / Vivaldi

1. Go to your browser's extensions page (`chrome://extensions`, `edge://extensions`, etc.)
2. Enable **Developer mode**
3. Click **Load unpacked** and select the repository folder

> **Note:** Chrome Web Store extensions cannot use blocking `webRequest`. The extension falls back to `declarativeNetRequest` for CWS-distributed versions. For full functionality, load unpacked.

### Safari (macOS / iOS)

```bash
xcrun safari-web-extension-converter /path/to/url-modifier \
  --project-location ~/Desktop \
  --app-name "URL Modifier"
```

Open the generated Xcode project, build, and run. The extension appears in Safari's extension preferences.

---

## Usage

### Creating a rule

1. Click the **URL Modifier** icon in the Firefox toolbar
2. Click **+ Add Rule**
3. Fill in:
   - **Name** — a label for the rule (e.g. `Strip UTM params`)
   - **Pattern** — a regex or plain text to match in the URL (e.g. `[?&]utm_[^&]*`)
   - **Modification** — the text to insert or use as a replacement (leave empty to delete the match)
4. Select the **Mode**: Before, Replace (default), or After
5. Click the **Activate** toggle in the header to start intercepting

### Example rules

| Name | Pattern | Modification | Mode | Effect |
|---|---|---|---|---|
| Strip UTM params | `[?&]utm_[^&]*` | *(empty)* | Replace | Removes `?utm_source=google&utm_medium=…` from every URL |
| Force HTTPS | `^http://` | `https://` | Replace | Upgrades all HTTP links to HTTPS before they load |
| Add CDN prefix | `(static\.example\.com)` | `cdn.` | Before | `static.example.com` → `cdn.static.example.com` |
| Strip trailing slash | `/$` | *(empty)* | Replace | Removes trailing slashes |
| Redirect subdomain | `^https://old\.` | `https://new.` | Replace | `old.site.com` → `new.site.com` |
| Remove referrer token | `[?&]ref=[^&]*` | *(empty)* | Replace | Strips referral tracking tokens |
| Swap domain | `a\.com` | `abc.com` | Replace | Rewrites any `a.com` URL to `abc.com` |

### Regex tips

- Use `^` and `$` to anchor to the start or end of the URL
- In **Replace** mode, reference capture groups with `$1`, `$2`, etc.  
  Example: pattern `(https?://)old\.(example\.com)`, modification `$1new.$2` → rewrites the subdomain while keeping the protocol and domain
- Special characters (`.`, `*`, `+`, `?`) must be escaped with `\` to match literally
- The global flag (`g`) and case-insensitive flag (`i`) are always applied — all matches in a URL are replaced, and case doesn't matter
- Invalid regex patterns automatically fall back to literal string matching

### Import / Export

Rules can be saved and loaded as JSON. Click **Export** to download your rules, and **Import** to load a previously saved file. The format is:

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Strip UTM params",
    "pattern": "[?&]utm_[^&]*",
    "modification": "",
    "mode": "replace",
    "enabled": true
  }
]
```

`mode` must be one of `"before"`, `"replace"`, or `"after"`.

---

## How it works

### Three-layer interception

The extension uses three independent interception mechanisms. Any one of them is sufficient to catch a request; together they make missed rewrites effectively impossible:

```
External app (e.g. Signal) opens a URL
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Layer 1 — webRequest.onBeforeRequest               │
│  Registered synchronously before any async code.    │
│  Firefox holds the request open while storage       │
│  loads. Catches ~99% of requests.                   │
└─────────────────────────────────────────────────────┘
         │  (if missed)
         ▼
┌─────────────────────────────────────────────────────┐
│  Layer 2 — webNavigation.onBeforeNavigate           │
│  Fires for main-frame navigations slightly later.   │
│  Issues a tabs.update() redirect.                   │
└─────────────────────────────────────────────────────┘
         │  (if missed)
         ▼
┌─────────────────────────────────────────────────────┐
│  Layer 3 — tabs.onUpdated                           │
│  Last resort. Catches any URL that actually begins  │
│  loading. Redirects immediately. May cause a brief  │
│  flash of the original URL.                         │
└─────────────────────────────────────────────────────┘
         │
         ▼
  Rewritten URL loads
```

### Cold-start handling

When an external app opens a URL in Firefox, the OS delivers an Intent and Firefox cold-starts. The background script must be parsed and executed before the listener can fire. The `webRequest` listener is registered at the **top level of the script** (not inside an async boot function), so Firefox attaches it as early as possible. If the storage cache isn't warm yet when the first request arrives, the handler `await`s the storage promise — Firefox holds the request open during this wait rather than dropping it.

### Storage strategy

Rules are stored in `browser.storage.local`. An in-memory cache is kept warm via `browser.storage.onChanged`, so the listener never needs to hit disk during a request. The cache is initialised `null` (not empty array) so the handler can distinguish "not loaded yet" from "loaded but no rules", and wait appropriately.

### Redirect loop prevention

When a URL is rewritten, Firefox fires `onBeforeRequest` again on the new URL. A `Set` of recently-redirected URLs prevents the extension from intercepting its own redirects in an infinite loop. Each entry expires after 5 seconds.

---

## File structure

```
url-modifier/
├── manifest.json                     MV3 manifest
└── src/
    ├── background/
    │   └── background.js             Service worker — all interception logic
    ├── popup/
    │   ├── popup.html                Toolbar popup UI
    │   └── popup.js                  Popup logic
    ├── options/
    │   ├── options.html              Full-page options editor
    │   └── options.js                Options logic
    └── icons/
        ├── icon-{16,32,48,128}.png   Default (inactive) toolbar icons
        ├── icon-on-{16,32,48,128}.png   Active state icons (green)
        └── icon-off-{16,32,48,128}.png  Inactive state icons (grey)
```

---

## Permissions

| Permission | Why it's needed |
|---|---|
| `storage` | Save rules and active state to `browser.storage.local` |
| `webRequest` | Intercept HTTP/HTTPS requests |
| `webRequestBlocking` | Return a redirect URL from the request handler |
| `webNavigation` | Layer 2 interception via `onBeforeNavigate` |
| `tabs` | Layer 2/3 redirect via `tabs.update()` |
| `<all_urls>` | Apply rules to requests on any domain |

This extension collects **no user data**. Rules are stored locally on your device and never transmitted anywhere.

---

## Browser compatibility

| Browser | Platform | Min version |
|---|---|---|
| Firefox | Windows, macOS, Linux | 140+ |
| Firefox | Android | 142+ |
| Chrome | All | 88+ |
| Edge | All | 88+ |
| Brave | All | 1.30+ |
| Opera | All | 74+ |
| Vivaldi | All | 5.0+ |
| Safari | macOS, iOS | 16+ (requires Xcode conversion) |

---

## Building a release

```bash
# Clone the repository
git clone https://github.com/gerbilbyte/URL-Modifier.git
cd URL-Modifier

# Package as .xpi (the zip format Firefox expects)
zip -r url-modifier.xpi \
  manifest.json \
  src/background/background.js \
  src/popup/popup.html \
  src/popup/popup.js \
  src/options/options.html \
  src/options/options.js \
  src/icons/icon-16.png \
  src/icons/icon-32.png \
  src/icons/icon-48.png \
  src/icons/icon-128.png \
  src/icons/icon-on-16.png \
  src/icons/icon-on-32.png \
  src/icons/icon-on-48.png \
  src/icons/icon-on-128.png \
  src/icons/icon-off-16.png \
  src/icons/icon-off-32.png \
  src/icons/icon-off-48.png \
  src/icons/icon-off-128.png

# Verify the zip
unzip -t url-modifier.xpi
```

To distribute on Firefox, the `.xpi` must be signed by Mozilla. Signed packages can be found in the [Releases](../../releases) page.

---

## Contributing

Pull requests are welcome. For significant changes, please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-change`)
3. Commit your changes (`git commit -m 'Add my change'`)
4. Push the branch (`git push origin feature/my-change`)
5. Open a Pull Request

---

## Licence

[PolyForm Noncommercial 1.0](LICENSE)

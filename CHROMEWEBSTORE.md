# Chrome Web Store Listing — Swift Jot

> **Single source of truth** for Chrome Web Store listing metadata, permissions justifications, privacy disclosures, and version history.
>
> Last updated: 2026-09-13
> Current version: 0.1.0

---

## 1. Store Listing Metadata

| Field | Value | Constraints |
|---|---|---|
| **Extension Name** | Swift Jot | Max 45 chars |
| **Short Description** | Fast, lightweight note-taking directly in your browser popup. | Max 132 chars |
| **Category** | Productivity | Web Store categories |
| **Default Language** | English | |

### Detailed Description (Markdown)

```markdown
Swift Jot is a fast, lightweight scratchpad extension designed for quick note-taking without opening new tabs or leaving your current workflow.

Key Features:
- Instant Access: Open your notes with a single click from the extension icon.
- Real-time Auto-Save: Never lose a thought. Notes are automatically saved to your local browser storage.
- Interactive YouTube Timestamps: One-click extraction of current video playback time (formatted as HH:MM:SS.mmm).
- Video Seeking: Jump the video to any timestamp using Ctrl+Click directly in your note, or click the dedicated top jump button.
- Word & Character Counters: Live statistics while you write.
- Quick Clipboard Actions: One-click copying and clearing.
- Clean, Minimal Design: Distraction-free interface with automatic light and dark mode support.
- Ultra Lightweight: Built with zero heavy dependencies for instant loading and minimal resource usage.
```

---

## 2. Permissions Justification

| Permission | Why It's Needed |
|---|---|
| `storage` | Required to persist your notes locally across browser sessions using Chrome's local storage API (`chrome.storage.local`). No personal data is sent to external servers. |
| `activeTab` | Required to detect if the currently active tab is an active YouTube page and provide context-aware timestamp features. |
| `scripting` | Required to execute a lightweight content query on the active YouTube page to read the current playback time or seek the video player to a clicked timestamp. |
| `*://*.youtube.com/*` (Host) | Required to query and control video playback status specifically on YouTube video and shorts pages when requested by the user. |

---

## 3. Privacy & Data Handling

- **Single Purpose**: Swift Jot serves solely as a local notepad/scratchpad utility.
- **Data Collection**: None. No analytics, tracking, or remote server communications are included.
- **Storage**: All user-entered text resides exclusively within the local browser profile via `chrome.storage.local`.

---

## 4. Version History

### 0.1.0 — 2026-09-13
- Initial release.
- Lightweight popup scratchpad with auto-save to local storage.
- One-click YouTube timestamp insertion formatted as `00:00:00.000` with `Alt+T` shortcut.
- Clickable timestamps: In-editor Ctrl+Click seeking and fixed top jump button with zero layout shift.
- Character and word counters.
- Clipboard copy and clear shortcuts.
- Light and dark theme support.

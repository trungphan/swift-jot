# Swift Jot

A fast, lightweight Manifest V3 Chrome extension for quick scratchpad note-taking directly in your browser.

Built with **Vite**, **TypeScript**, and **npm** — zero heavy frameworks, ultra-fast and lightweight.

---

## Features

- **Lightweight & Fast**: Built with vanilla TypeScript and minimal bundle size (<25 KB).
- **Auto-Saving**: Real-time debounced persistence using `chrome.storage.local`.
- **Theme Support**: Seamless light and dark mode out-of-the-box (`prefers-color-scheme`).
- **Word & Character Counters**: Live statistics updated as you write.
- **Quick Copy**: Fast one-click clipboard copying.

---

## Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Development Mode (with Live Reload / HMR)

```bash
npm run dev
```

### 3. Build for Production

```bash
npm run build
```

This compiles TypeScript, bundles the extension, and outputs the production-ready extension to the `dist/` directory.

---

## Loading Unpacked Extension in Chrome

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the `dist` folder inside this project directory (`swift-jot/dist`).
5. Pin **Swift Jot** to your browser toolbar and click it to open your scratchpad.

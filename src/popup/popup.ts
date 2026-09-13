interface StorageData {
  swiftJotNote?: string;
}

const STORAGE_KEY = 'swiftJotNote';
const DEBOUNCE_DELAY_MS = 300;

function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((totalSeconds % 1) * 1000);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(milliseconds, 3)}`;
}

function parseTimestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(':');
  if (parts.length !== 3) return 0;
  const [hStr, mStr, sStr] = parts;
  const hours = parseInt(hStr, 10) || 0;
  const minutes = parseInt(mStr, 10) || 0;
  const [secStr, msStr] = sStr.split('.');
  const seconds = parseInt(secStr, 10) || 0;
  const millis = parseInt(msStr, 10) || 0;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

const TIMESTAMP_REGEX = /\b\d{2}:\d{2}:\d{2}\.\d{3}\b/g;

function extractTimestamps(text: string): string[] {
  const matches = text.match(TIMESTAMP_REGEX);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

function getTimestampAtPosition(text: string, pos: number): string | null {
  const regex = /\b\d{2}:\d{2}:\d{2}\.\d{3}\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (pos >= start && pos <= end) {
      return match[0];
    }
  }
  return null;
}

function isYouTubeUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'www.youtube.com' ||
      parsed.hostname === 'youtube.com' ||
      parsed.hostname === 'm.youtube.com'
    );
  } catch {
    return false;
  }
}

function renderSyntaxHighlights(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Timestamps: 00:00:00.000
  html = html.replace(
    /\b(\d{2}:\d{2}:\d{2}\.\d{3})\b/g,
    '<mark class="hl-timestamp">$1</mark>'
  );

  // Markdown headings: # Heading
  html = html.replace(
    /(^|\n)(#{1,6}\s[^\n]+)/g,
    '$1<span class="hl-heading">$2</span>'
  );

  // Markdown inline code: `code`
  html = html.replace(
    /(`[^`\n]+`)/g,
    '<span class="hl-code">$1</span>'
  );

  // Markdown bold: **bold**
  html = html.replace(
    /(\*\*[^*\n]+\*\*)/g,
    '<span class="hl-bold">$1</span>'
  );

  // URLs
  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<span class="hl-link">$1</span>'
  );

  if (text.endsWith('\n')) {
    html += ' ';
  }

  return html;
}

class SwiftJotPopup {
  private textarea: HTMLTextAreaElement;
  private highlightLayer: HTMLElement;
  private saveStatus: HTMLElement;
  private charCountEl: HTMLElement;
  private wordCountEl: HTMLElement;
  private timestampBtn: HTMLButtonElement;
  private copyBtn: HTMLButtonElement;
  private clearBtn: HTMLButtonElement;
  private toastEl: HTMLElement;
  private timestampBar: HTMLElement;
  private quickJumpBtn: HTMLButtonElement;
  private quickJumpText: HTMLElement;

  private activeTimestamp: string | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.textarea = document.getElementById('note-textarea') as HTMLTextAreaElement;
    this.highlightLayer = document.getElementById('highlight-layer') as HTMLElement;
    this.saveStatus = document.getElementById('save-status') as HTMLElement;
    this.charCountEl = document.getElementById('char-count') as HTMLElement;
    this.wordCountEl = document.getElementById('word-count') as HTMLElement;
    this.timestampBtn = document.getElementById('timestamp-btn') as HTMLButtonElement;
    this.copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
    this.clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
    this.toastEl = document.getElementById('toast') as HTMLElement;
    this.timestampBar = document.getElementById('timestamp-bar') as HTMLElement;
    this.quickJumpBtn = document.getElementById('quick-jump-btn') as HTMLButtonElement;
    this.quickJumpText = document.getElementById('quick-jump-text') as HTMLElement;

    this.init();
  }

  private async init(): Promise<void> {
    await this.loadNote();
    this.bindEvents();
    this.updateCounters(this.textarea.value);
    this.updateJumpBar(this.textarea.value);
    this.syncHighlights();
    await this.checkYouTubeStatus();
  }

  private async loadNote(): Promise<void> {
    try {
      const data = (await chrome.storage.local.get(STORAGE_KEY)) as StorageData;
      if (typeof data.swiftJotNote === 'string') {
        this.textarea.value = data.swiftJotNote;
      }
    } catch (error) {
      console.error('Failed to load note from storage:', error);
    }
  }

  private bindEvents(): void {
    this.textarea.addEventListener('input', () => {
      this.handleInput();
      this.checkCursorTimestamp();
    });

    this.textarea.addEventListener('scroll', () => {
      this.highlightLayer.scrollTop = this.textarea.scrollTop;
      this.highlightLayer.scrollLeft = this.textarea.scrollLeft;
    });

    this.textarea.addEventListener('click', async (e: MouseEvent) => {
      await this.handleTextareaClick(e);
    });

    this.textarea.addEventListener('keyup', () => {
      this.checkCursorTimestamp();
    });

    this.quickJumpBtn.addEventListener('click', async () => {
      if (this.activeTimestamp) {
        await this.seekYouTubeVideo(this.activeTimestamp);
      }
    });

    this.timestampBtn.addEventListener('click', async () => {
      await this.insertYouTubeTimestamp();
    });

    this.copyBtn.addEventListener('click', async () => {
      await this.copyToClipboard();
    });

    this.clearBtn.addEventListener('click', async () => {
      await this.clearNote();
    });

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        this.insertYouTubeTimestamp();
      }
    });
  }

  private async checkYouTubeStatus(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && isYouTubeUrl(tab.url)) {
        this.timestampBtn.classList.add('has-youtube');
        this.timestampBtn.title = 'Insert YouTube timestamp (Alt+T) • Video detected';
      }
    } catch (err) {
      console.error('Failed to check YouTube status:', err);
    }
  }

  private async insertYouTubeTimestamp(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        this.showToast('No active tab found');
        return;
      }

      if (!isYouTubeUrl(tab.url)) {
        this.showToast('Current tab is not YouTube');
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const video = (document.querySelector('video.html5-main-video') ||
            document.querySelector('video')) as HTMLVideoElement | null;
          if (!video) return null;
          return video.currentTime;
        },
      });

      const currentTime = results?.[0]?.result;

      if (typeof currentTime !== 'number' || isNaN(currentTime)) {
        this.showToast('No video found on page');
        return;
      }

      const formatted = formatTimestamp(currentTime);
      this.insertTextAtCursor(`${formatted} `);
      this.showToast(`Inserted: ${formatted}`);
    } catch (error) {
      console.error('Failed to fetch YouTube timestamp:', error);
      this.showToast('Could not fetch timestamp');
    }
  }

  private insertTextAtCursor(textToInsert: string): void {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    const val = this.textarea.value;

    let insertion = textToInsert;
    if (val.length > 0 && start === end && start > 0 && val[start - 1] !== '\n' && val[start - 1] !== ' ') {
      insertion = `\n${textToInsert}`;
    }

    this.textarea.value = val.slice(0, start) + insertion + val.slice(end);
    const newCursorPos = start + insertion.length;
    this.textarea.selectionStart = newCursorPos;
    this.textarea.selectionEnd = newCursorPos;
    this.textarea.focus();

    this.handleInput();
  }

  private handleInput(): void {
    const text = this.textarea.value;
    this.updateCounters(text);
    this.updateJumpBar(text);
    this.syncHighlights();
    this.setSaveStatus('Saving...');

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      await this.saveNote(text);
    }, DEBOUNCE_DELAY_MS);
  }

  private syncHighlights(): void {
    this.highlightLayer.innerHTML = renderSyntaxHighlights(this.textarea.value);
    this.highlightLayer.scrollTop = this.textarea.scrollTop;
    this.highlightLayer.scrollLeft = this.textarea.scrollLeft;
  }

  private async handleTextareaClick(e: MouseEvent): Promise<void> {
    const pos = this.textarea.selectionStart;
    const ts = getTimestampAtPosition(this.textarea.value, pos);
    if (ts) {
      this.showQuickJump(ts);
      // Only jump if the user does Ctrl+Click (or Cmd+Click) on the timestamp
      if (e.ctrlKey || e.metaKey) {
        await this.seekYouTubeVideo(ts);
      }
    } else {
      this.checkCursorTimestamp();
    }
  }

  private checkCursorTimestamp(): void {
    const pos = this.textarea.selectionStart;
    const ts = getTimestampAtPosition(this.textarea.value, pos);
    if (ts) {
      this.showQuickJump(ts);
    } else {
      this.hideQuickJump();
    }
  }

  private showQuickJump(timestamp: string): void {
    this.activeTimestamp = timestamp;
    this.quickJumpText.textContent = `Jump video to ${timestamp}`;
    this.timestampBar.classList.remove('hidden');
  }

  private hideQuickJump(): void {
    this.updateJumpBar(this.textarea.value);
  }

  private updateJumpBar(text: string): void {
    const timestamps = extractTimestamps(text);
    if (timestamps.length === 0) {
      this.activeTimestamp = null;
      this.timestampBar.classList.add('hidden');
      return;
    }

    if (!this.activeTimestamp || !timestamps.includes(this.activeTimestamp)) {
      this.activeTimestamp = timestamps[0];
    }

    this.quickJumpText.textContent = `Jump video to ${this.activeTimestamp}`;
    this.timestampBar.classList.remove('hidden');
  }

  private async seekYouTubeVideo(timestamp: string): Promise<boolean> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        this.showToast('No active tab found');
        return false;
      }

      if (!isYouTubeUrl(tab.url)) {
        this.showToast('Active tab is not YouTube');
        return false;
      }

      const targetSeconds = parseTimestampToSeconds(timestamp);

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [targetSeconds],
        func: (seconds: number) => {
          const video = (document.querySelector('video.html5-main-video') ||
            document.querySelector('video')) as HTMLVideoElement | null;
          if (!video) return false;
          video.currentTime = seconds;
          return true;
        },
      });

      const success = results?.[0]?.result;
      if (success) {
        this.showToast(`Jumped video to ${timestamp}`);
        return true;
      } else {
        this.showToast('No video player found');
        return false;
      }
    } catch (error) {
      console.error('Failed to seek YouTube video:', error);
      this.showToast('Failed to jump video');
      return false;
    }
  }

  private async saveNote(content: string): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: content });
      this.setSaveStatus('Saved');
    } catch (error) {
      console.error('Failed to save note:', error);
      this.setSaveStatus('Error saving');
    }
  }

  private updateCounters(text: string): void {
    const charCount = text.length;
    const trimmed = text.trim();
    const wordCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;

    this.charCountEl.textContent = `${charCount} ${charCount === 1 ? 'char' : 'chars'}`;
    this.wordCountEl.textContent = `${wordCount} ${wordCount === 1 ? 'word' : 'words'}`;
  }

  private setSaveStatus(status: string): void {
    this.saveStatus.textContent = status;
  }

  private async copyToClipboard(): Promise<void> {
    const text = this.textarea.value;
    if (!text) {
      this.showToast('Nothing to copy');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Copied to clipboard');
    } catch (error) {
      console.error('Failed to copy text:', error);
      this.showToast('Failed to copy');
    }
  }

  private async clearNote(): Promise<void> {
    if (!this.textarea.value) return;

    this.textarea.value = '';
    this.updateCounters('');
    this.updateJumpBar('');
    this.syncHighlights();
    await this.saveNote('');
    this.showToast('Note cleared');
  }

  private showToast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');

    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }

    this.toastTimeout = setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 1800);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SwiftJotPopup();
});

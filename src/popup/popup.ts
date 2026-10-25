interface PopupSize {
  width: number;
  height: number;
}

interface StorageData {
  swiftJotNote?: string;
  swiftJotPopupSize?: PopupSize;
}

const STORAGE_KEY = 'swiftJotNote';
const POPUP_SIZE_KEY = 'swiftJotPopupSize';
const DEBOUNCE_DELAY_MS = 300;

const DEFAULT_WIDTH = 380;
const DEFAULT_HEIGHT = 420;
const MIN_WIDTH = 340;
const MAX_WIDTH = 800;
const MIN_HEIGHT = 280;
const MAX_HEIGHT = 600;

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

function cleanYouTubeTitle(rawTitle?: string): string {
  if (!rawTitle) return '';
  let title = rawTitle
    .replace(/^\(\d+\+?\)\s*/, '') // Remove "(1) " or "(99+) " notification badges
    .replace(/\s*-\s*YouTube$/i, '') // Remove "- YouTube"
    .replace(/\s*\|\s*YouTube$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Decode common HTML entities if present from meta tags
  title = title
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  return title;
}

function extractYouTubeVideoId(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  try {
    const urlStr = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0]?.split('?')[0];
      if (id && /^[a-zA-Z0-9_-]+$/.test(id)) return id;
    }

    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const v = url.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]+$/.test(v)) return v;

      const shortsMatch = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch) return shortsMatch[1];

      const liveMatch = url.pathname.match(/^\/live\/([a-zA-Z0-9_-]+)/);
      if (liveMatch) return liveMatch[1];

      const embedMatch = url.pathname.match(/^\/embed\/([a-zA-Z0-9_-]+)/);
      if (embedMatch) return embedMatch[1];
    }
  } catch {
    // Fall back to regex parsing
  }

  const regexMatch = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?[^\s<]*v=|shorts\/|live\/|embed\/))([a-zA-Z0-9_-]{11})/
  );
  return regexMatch ? regexMatch[1] : null;
}

function isYouTubeVideoUrl(url?: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

function getYouTubeUrlAtPosition(text: string, pos: number): string | null {
  const urlRegex = /(https?:\/\/[^\s<]+|\byoutu\.be\/[^\s<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    const rawUrl = match[0];
    const cleanUrl = rawUrl.replace(/[.,;:!?)]+$/, '');
    const start = match.index;
    const end = start + cleanUrl.length;
    if (pos >= start && pos <= end) {
      if (isYouTubeVideoUrl(cleanUrl)) {
        return cleanUrl;
      }
    }
  }
  return null;
}

function isFacebookUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  try {
    const urlStr = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'facebook.com' ||
      host === 'www.facebook.com' ||
      host === 'm.facebook.com' ||
      host === 'web.facebook.com' ||
      host.endsWith('.facebook.com') ||
      host === 'fb.watch' ||
      host.endsWith('.fb.watch')
    );
  } catch {
    return false;
  }
}

function cleanFacebookUrl(rawUrl: string): string {
  try {
    const urlStr = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
    const url = new URL(urlStr);
    let host = url.hostname.toLowerCase();
    if (host.endsWith('facebook.com')) {
      url.hostname = 'www.facebook.com';
    }
    url.protocol = 'https:';

    const trackingParams = [
      'fbclid', 'ref', 'mibextid', 'rdid', '__tn__', '__cft__',
      'notif_t', 'notif_id', 'comment_id', 'reply_comment_id',
      'paipv', 'eav', 'fs', 's', 'checkpoint_src', 'sfnsn',
      '__xts__', 'set'
    ];
    for (const param of trackingParams) {
      url.searchParams.delete(param);
    }
    const keysToDelete: string[] = [];
    url.searchParams.forEach((_, key) => {
      if (key.startsWith('__') || key.startsWith('utm_')) {
        keysToDelete.push(key);
      }
    });
    for (const key of keysToDelete) {
      url.searchParams.delete(key);
    }

    // Reel URLs: /reel/<id>, /reels/<id>, /share/r/<id>
    const reelMatch = url.pathname.match(/\/(?:reel|reels)\/([a-zA-Z0-9_-]+)/);
    if (reelMatch && reelMatch[1]) {
      return `https://www.facebook.com/reel/${reelMatch[1]}`;
    }

    const shareReelMatch = url.pathname.match(/\/share\/r\/([a-zA-Z0-9_-]+)/);
    if (shareReelMatch && shareReelMatch[1]) {
      return `https://www.facebook.com/reel/${shareReelMatch[1]}`;
    }

    // Video URLs: /watch/?v=<id> or /videos/<id>
    const v = url.searchParams.get('v');
    if (v && /^\d+$/.test(v)) {
      return `https://www.facebook.com/watch/?v=${v}`;
    }

    const videoMatch = url.pathname.match(/\/videos\/([a-zA-Z0-9_-]+)/);
    if (videoMatch && videoMatch[1]) {
      return `https://www.facebook.com/watch/?v=${videoMatch[1]}`;
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}

function getFacebookUrlAtPosition(text: string, pos: number): string | null {
  const urlRegex = /(https?:\/\/[^\s<]+|\b(?:facebook\.com|www\.facebook\.com|m\.facebook\.com|fb\.watch)\/[^\s<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    const rawUrl = match[0];
    const cleanUrl = rawUrl.replace(/[.,;:!?)]+$/, '');
    const start = match.index;
    const end = start + cleanUrl.length;
    if (pos >= start && pos <= end) {
      if (isFacebookUrl(cleanUrl)) {
        return cleanUrl;
      }
    }
  }
  return null;
}

function isYouTubeUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'www.youtube.com' ||
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtu.be' ||
      host.endsWith('.youtube.com')
    );
  } catch {
    return false;
  }
}

const MEDIA_EXTENSIONS = /\.(mp4|webm|ogg|ogv|mov|mkv|m4v|avi|wmv|flv|3gp|ts|mp3|wav|m4a|aac|flac|opus|weba|oga|mid|midi|wma)(?:[?#].*)?$/i;

function normalizeToLocalFileUrl(pathOrUrl: string): string {
  let trimmed = pathOrUrl.trim().replace(/[.,;:!?)]+$/, '');
  if (trimmed.startsWith('file:///')) {
    try {
      return encodeURI(decodeURI(trimmed));
    } catch {
      return trimmed;
    }
  }
  if (trimmed.startsWith('file://')) {
    try {
      return encodeURI(decodeURI(trimmed.replace(/^file:\/\//, 'file:///')));
    } catch {
      return trimmed.replace(/^file:\/\//, 'file:///');
    }
  }
  // Windows drive letter: C:\path or C:/path
  if (/^[a-zA-Z]:[/\\]/.test(trimmed)) {
    const normalizedPath = trimmed.replace(/\\/g, '/');
    try {
      return `file:///${encodeURI(decodeURI(normalizedPath))}`;
    } catch {
      return `file:///${normalizedPath}`;
    }
  }
  // Unix path: /Users/... or /home/...
  if (trimmed.startsWith('/')) {
    try {
      return `file://${encodeURI(decodeURI(trimmed))}`;
    } catch {
      return `file://${trimmed}`;
    }
  }
  return trimmed;
}

function isLocalMediaUrl(urlOrPath?: string): boolean {
  if (!urlOrPath) return false;
  const trimmed = urlOrPath.trim();
  if (trimmed.startsWith('file://')) {
    return true;
  }
  if (/^[a-zA-Z]:[/\\]/.test(trimmed) && MEDIA_EXTENSIONS.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith('/') && MEDIA_EXTENSIONS.test(trimmed)) {
    return true;
  }
  return false;
}

function getLocalMediaUrlAtPosition(text: string, pos: number): string | null {
  // 1. file:/// links (with or without %20)
  const fileUrlRegex = /file:\/\/\/[^\s<"']+/gi;
  let match: RegExpExecArray | null;
  while ((match = fileUrlRegex.exec(text)) !== null) {
    const rawUrl = match[0];
    const cleanUrl = rawUrl.replace(/[.,;:!?)]+$/, '');
    const start = match.index;
    const end = start + cleanUrl.length;
    if (pos >= start && pos <= end) {
      return cleanUrl;
    }
  }

  // 2. Windows drive paths or Unix paths with media extensions
  const pathRegex =
    /(?:^|[\s"'(])([a-zA-Z]:[\\/][^\s<"']+\.(?:mp4|webm|ogg|ogv|mov|mkv|m4v|avi|wmv|flv|3gp|ts|mp3|wav|m4a|aac|flac|opus|weba|oga|mid|midi|wma)|\/(?:Users|home|[a-zA-Z0-9_.-]+)\/[^\s<"']+\.(?:mp4|webm|ogg|ogv|mov|mkv|m4v|avi|wmv|flv|3gp|ts|mp3|wav|m4a|aac|flac|opus|weba|oga|mid|midi|wma))/gi;
  while ((match = pathRegex.exec(text)) !== null) {
    const rawPath = match[1];
    const cleanPath = rawPath.replace(/[.,;:!?)]+$/, '');
    const start = match.index + (match[0].length - match[1].length);
    const end = start + cleanPath.length;
    if (pos >= start && pos <= end) {
      return cleanPath;
    }
  }

  return null;
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

  // URLs & local media paths
  html = html.replace(
    /(file:\/\/\/[^\s<]+|https?:\/\/[^\s<]+|\b(?:youtu\.be|facebook\.com|www\.facebook\.com|m\.facebook\.com|fb\.watch)\/[^\s<]+|[a-zA-Z]:[\\/][^\s<"']+\.(?:mp4|webm|ogg|ogv|mov|mkv|m4v|avi|wmv|flv|3gp|ts|mp3|wav|m4a|aac|flac|opus|weba|oga|mid|midi|wma))/gi,
    (url) => {
      const cleanUrl = url.replace(/[.,;:!?)]+$/, '');
      const trailing = url.slice(cleanUrl.length);
      if (isYouTubeVideoUrl(cleanUrl)) {
        return `<mark class="hl-youtube-link">${cleanUrl}</mark>${trailing}`;
      }
      if (isFacebookUrl(cleanUrl)) {
        return `<mark class="hl-facebook-link">${cleanUrl}</mark>${trailing}`;
      }
      if (isLocalMediaUrl(cleanUrl)) {
        return `<mark class="hl-local-media-link">${cleanUrl}</mark>${trailing}`;
      }
      return `<span class="hl-link">${url}</span>`;
    }
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
  private mediaLinkBtn: HTMLButtonElement;
  private timestampBtn: HTMLButtonElement;
  private copyBtn: HTMLButtonElement;
  private clearBtn: HTMLButtonElement;
  private toastEl: HTMLElement;
  private timestampBar: HTMLElement;
  private quickJumpBtn: HTMLButtonElement;
  private quickJumpText: HTMLElement;
  private resizeHandleLeft: HTMLButtonElement;
  private resizeHandleRight: HTMLButtonElement;

  private activeTimestamp: string | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.textarea = document.getElementById('note-textarea') as HTMLTextAreaElement;
    this.highlightLayer = document.getElementById('highlight-layer') as HTMLElement;
    this.saveStatus = document.getElementById('save-status') as HTMLElement;
    this.charCountEl = document.getElementById('char-count') as HTMLElement;
    this.wordCountEl = document.getElementById('word-count') as HTMLElement;
    this.mediaLinkBtn = document.getElementById('media-link-btn') as HTMLButtonElement;
    this.timestampBtn = document.getElementById('timestamp-btn') as HTMLButtonElement;
    this.copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
    this.clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
    this.toastEl = document.getElementById('toast') as HTMLElement;
    this.timestampBar = document.getElementById('timestamp-bar') as HTMLElement;
    this.quickJumpBtn = document.getElementById('quick-jump-btn') as HTMLButtonElement;
    this.quickJumpText = document.getElementById('quick-jump-text') as HTMLElement;
    this.resizeHandleLeft = document.getElementById('resize-handle-left') as HTMLButtonElement;
    this.resizeHandleRight = document.getElementById('resize-handle-right') as HTMLButtonElement;

    this.init();
  }

  private async init(): Promise<void> {
    await this.loadPopupSize();
    await this.loadNote();
    this.bindEvents();
    this.setupResizeHandles();
    this.updateCounters(this.textarea.value);
    this.updateJumpBar(this.textarea.value);
    this.syncHighlights();
    await this.checkActiveMediaStatus();
  }

  private async loadPopupSize(): Promise<void> {
    try {
      const data = (await chrome.storage.local.get(POPUP_SIZE_KEY)) as StorageData;
      const size = data?.swiftJotPopupSize;
      if (size && typeof size.width === 'number' && typeof size.height === 'number') {
        const w = Math.min(Math.max(size.width, MIN_WIDTH), MAX_WIDTH);
        const h = Math.min(Math.max(size.height, MIN_HEIGHT), MAX_HEIGHT);
        document.body.style.width = `${w}px`;
        document.body.style.height = `${h}px`;
      }
    } catch (err) {
      console.error('Failed to load popup size:', err);
    }
  }

  private async savePopupSize(width: number, height: number): Promise<void> {
    try {
      await chrome.storage.local.set({ [POPUP_SIZE_KEY]: { width, height } });
    } catch (err) {
      console.error('Failed to save popup size:', err);
    }
  }

  private setupResizeHandles(): void {
    this.setupSingleResizeHandle(this.resizeHandleRight, 'right');
    this.setupSingleResizeHandle(this.resizeHandleLeft, 'left');

    const resetToDefault = async () => {
      document.body.style.width = `${DEFAULT_WIDTH}px`;
      document.body.style.height = `${DEFAULT_HEIGHT}px`;
      await this.savePopupSize(DEFAULT_WIDTH, DEFAULT_HEIGHT);
      this.syncHighlights();
      this.showToast('Reset window to default size');
    };

    this.resizeHandleLeft.addEventListener('dblclick', resetToDefault);
    this.resizeHandleRight.addEventListener('dblclick', resetToDefault);
  }

  private setupSingleResizeHandle(handle: HTMLButtonElement, side: 'left' | 'right'): void {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    let currentWidth = DEFAULT_WIDTH;
    let currentHeight = DEFAULT_HEIGHT;

    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      isDragging = true;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        // Fallback if pointer capture is unsupported
      }
      handle.classList.add('resizing');
      document.body.style.userSelect = 'none';

      startX = e.clientX;
      startY = e.clientY;
      startWidth = document.body.offsetWidth || window.innerWidth;
      startHeight = document.body.offsetHeight || window.innerHeight;
      currentWidth = startWidth;
      currentHeight = startHeight;
    });

    handle.addEventListener('pointermove', (e: PointerEvent) => {
      if (!isDragging) return;
      e.preventDefault();

      const deltaX = side === 'right' ? e.clientX - startX : startX - e.clientX;
      const deltaY = e.clientY - startY;

      currentWidth = Math.min(Math.max(startWidth + deltaX, MIN_WIDTH), MAX_WIDTH);
      currentHeight = Math.min(Math.max(startHeight + deltaY, MIN_HEIGHT), MAX_HEIGHT);

      document.body.style.width = `${currentWidth}px`;
      document.body.style.height = `${currentHeight}px`;

      this.syncHighlights();
    });

    const stopResize = async (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      handle.classList.remove('resizing');
      document.body.style.userSelect = '';

      await this.savePopupSize(currentWidth, currentHeight);
      this.syncHighlights();
    };

    handle.addEventListener('pointerup', stopResize);
    handle.addEventListener('pointercancel', stopResize);
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
        await this.seekVideo(this.activeTimestamp);
      }
    });

    this.mediaLinkBtn.addEventListener('click', async () => {
      await this.insertMediaLink();
    });

    this.timestampBtn.addEventListener('click', async () => {
      await this.insertTimestamp();
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
        this.insertTimestamp();
      } else if (
        e.altKey &&
        (e.key === 'm' ||
          e.key === 'M' ||
          e.key === 'y' ||
          e.key === 'Y' ||
          e.key === 'l' ||
          e.key === 'L' ||
          e.key === 'f' ||
          e.key === 'F')
      ) {
        e.preventDefault();
        this.insertMediaLink();
      }
    });
  }

  private async checkActiveMediaStatus(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      this.mediaLinkBtn.classList.remove('has-youtube', 'has-facebook', 'has-local-media', 'has-media');
      this.timestampBtn.classList.remove('has-media', 'has-youtube');

      if (isYouTubeUrl(tab.url)) {
        this.mediaLinkBtn.classList.add('has-youtube');
        this.mediaLinkBtn.title = 'Insert media link (Alt+M) • YouTube video detected';
        this.timestampBtn.classList.add('has-media');
        this.timestampBtn.title = 'Insert media timestamp (Alt+T) • YouTube video detected';
      } else if (isFacebookUrl(tab.url)) {
        this.mediaLinkBtn.classList.add('has-facebook');
        const isReel = !!(tab.url && (tab.url.includes('/reel/') || tab.url.includes('/reels/')));
        if (isReel) {
          this.mediaLinkBtn.title = 'Insert media link (Alt+M) • Facebook reel detected';
          this.timestampBtn.classList.add('has-media');
          this.timestampBtn.title = 'Insert media timestamp (Alt+T) • Facebook reel detected';
        } else {
          this.mediaLinkBtn.title = 'Insert media link (Alt+M) • Facebook video detected';
          this.timestampBtn.classList.add('has-media');
          this.timestampBtn.title = 'Insert media timestamp (Alt+T) • Facebook video detected';
        }
      } else if (tab.url?.startsWith('file://')) {
        this.mediaLinkBtn.classList.add('has-local-media');
        this.mediaLinkBtn.title = 'Insert media link (Alt+M) • Local media detected';
        this.timestampBtn.classList.add('has-media');
        this.timestampBtn.title = 'Insert media timestamp (Alt+T) • Local media detected';
      } else if (tab.id) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              return !!document.querySelector('video, audio');
            },
          });
          if (results?.[0]?.result) {
            this.mediaLinkBtn.classList.add('has-local-media');
            this.mediaLinkBtn.title = 'Insert media link (Alt+M) • Media player detected';
            this.timestampBtn.classList.add('has-media');
            this.timestampBtn.title = 'Insert media timestamp (Alt+T) • Media player detected';
          } else {
            this.mediaLinkBtn.title = 'Insert media link (Alt+M)';
            this.timestampBtn.title = 'Insert media timestamp (Alt+T)';
          }
        } catch {
          this.mediaLinkBtn.title = 'Insert media link (Alt+M)';
          this.timestampBtn.title = 'Insert media timestamp (Alt+T)';
        }
      } else {
        this.mediaLinkBtn.title = 'Insert media link (Alt+M)';
        this.timestampBtn.title = 'Insert media timestamp (Alt+T)';
      }
    } catch (err) {
      console.error('Failed to check media status:', err);
    }
  }

  private async insertMediaLink(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        this.showToast('No active tab found');
        return;
      }

      if (isYouTubeUrl(tab.url)) {
        await this.insertYouTubeVideoUrl();
        return;
      }

      if (isFacebookUrl(tab.url)) {
        await this.insertFacebookLink();
        return;
      }

      if (tab.url?.startsWith('file://')) {
        await this.insertLocalMediaLink(tab);
        return;
      }

      // Check if page contains video or audio element
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const media = (document.querySelector('video') ||
              document.querySelector('audio')) as HTMLMediaElement | null;
            if (!media) return null;
            const src = media.currentSrc || media.src || window.location.href;
            return {
              src,
              title: document.title,
            };
          },
        });

        const info = results?.[0]?.result;
        if (info && info.src) {
          if (info.src.startsWith('file://')) {
            await this.insertLocalMediaLink({
              ...tab,
              url: info.src,
              title: info.title || tab.title,
            });
            return;
          }

          const title = (info.title || tab.title || '').replace(/\s*-\s*Google Chrome$/i, '').trim();
          const textToInsert = title ? `${info.src} ${title}\n` : `${info.src}\n`;
          this.insertTextAtCursor(textToInsert);
          this.showToast('Inserted media link');
          return;
        }
      } catch {
        // Scripting not permitted or failed
      }

      this.showToast('No media detected in current tab');
    } catch (error) {
      console.error('Failed to insert media link:', error);
      this.showToast('Could not fetch media link');
    }
  }

  private async insertLocalMediaLink(tab: chrome.tabs.Tab): Promise<void> {
    try {
      const filePath = tab.url || '';
      let title = (tab.title || '').replace(/\s*-\s*Google Chrome$/i, '').trim();

      if (!title) {
        try {
          const pathname = new URL(filePath).pathname;
          const decoded = decodeURIComponent(pathname);
          const parts = decoded.split('/');
          title = parts[parts.length - 1] || '';
        } catch {
          const parts = decodeURIComponent(filePath).split('/');
          title = parts[parts.length - 1] || '';
        }
      }

      const textToInsert = title ? `${filePath} ${title}\n` : `${filePath}\n`;
      this.insertTextAtCursor(textToInsert);
      this.showToast(`Inserted: ${title || filePath}`);
    } catch (error) {
      console.error('Failed to insert local media link:', error);
      this.showToast('Could not insert local media link');
    }
  }

  private async openLocalMedia(rawUrlOrPath: string): Promise<void> {
    try {
      const targetUrl = normalizeToLocalFileUrl(rawUrlOrPath);

      // Check if user allowed file scheme access
      const isAllowed = await chrome.extension.isAllowedFileSchemeAccess().catch(() => false);
      if (!isAllowed) {
        this.showToast('Please enable "Allow access to file URLs" in chrome://extensions');
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        await chrome.tabs.create({ url: targetUrl });
        this.showToast('Opening media in new tab...');
        return;
      }

      const tabId = tab.id;
      const currentDecoded = decodeURI(tab.url || '');
      const targetDecoded = decodeURI(targetUrl);

      if (currentDecoded === targetDecoded) {
        // Current tab is already at this media URL: play it directly
        await chrome.scripting
          .executeScript({
            target: { tabId },
            func: () => {
              const media = (document.querySelector('video') ||
                document.querySelector('audio')) as HTMLMediaElement | null;
              if (media) {
                media.play().catch(() => { });
              }
            },
          })
          .catch(() => { });
        this.showToast('Playing media in current tab...');
        return;
      }

      // Notify service worker to auto-play once navigation completes
      try {
        await chrome.runtime.sendMessage({
          type: 'ENSURE_PLAY_ON_LOAD',
          tabId,
        });
      } catch {
        // SW listener fallback
      }

      // Also listen in popup if still alive
      const playListener = (updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(playListener);
          chrome.scripting
            .executeScript({
              target: { tabId },
              func: () => {
                const media = (document.querySelector('video') ||
                  document.querySelector('audio')) as HTMLMediaElement | null;
                if (media) {
                  media.play().catch(() => { });
                }
              },
            })
            .catch(() => { });
        }
      };
      chrome.tabs.onUpdated.addListener(playListener);
      setTimeout(() => chrome.tabs.onUpdated.removeListener(playListener), 15000);

      await chrome.tabs.update(tabId, { url: targetUrl });
      this.showToast('Loading and playing media in current tab...');
    } catch (error) {
      console.error('Failed to open local media:', error);
      this.showToast('Failed to load local media');
    }
  }

  private async insertYouTubeVideoUrl(): Promise<void> {
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

      let videoId = extractYouTubeVideoId(tab.url);
      let videoTitle = cleanYouTubeTitle(tab.title);

      // Query the tab page for accurate player video ID and clean video title
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const player = document.querySelector('#movie_player') as any;
            let id: string | null = null;
            let title: string | null = null;
            if (player && typeof player.getVideoData === 'function') {
              const data = player.getVideoData();
              id = data?.video_id || null;
              title = data?.title || null;
            }

            if (!title) {
              // Title format is like "(1) Title - YouTube" where (1) is the notification count and only exists if the notification count > 0 (when the notification bell exists notification).
              title = document.title.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '');
            }

            const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
            return {
              id,
              title,
              canonical,
              href: window.location.href,
              docTitle: document.title,
            };
          },
        });

        const pageData = results?.[0]?.result;
        if (pageData) {
          if (!videoId && pageData.id) {
            videoId = pageData.id;
          }
          if (!videoId && pageData.canonical) {
            videoId = extractYouTubeVideoId(pageData.canonical);
          }
          if (!videoId && pageData.href) {
            videoId = extractYouTubeVideoId(pageData.href);
          }

          if (pageData.title) {
            videoTitle = cleanYouTubeTitle(pageData.title);
          } else if (pageData.docTitle && !videoTitle) {
            videoTitle = cleanYouTubeTitle(pageData.docTitle);
          }
        }
      } catch (scriptErr) {
        console.error('Failed to query tab video data:', scriptErr);
      }

      if (!videoId) {
        this.showToast('No YouTube video detected');
        return;
      }

      const shortUrl = `youtu.be/${videoId}`;
      const textToInsert = videoTitle ? `${shortUrl} ${videoTitle}\n` : `${shortUrl}\n`;
      this.insertTextAtCursor(textToInsert);
      this.showToast(`Inserted: ${shortUrl}`);
    } catch (error) {
      console.error('Failed to insert YouTube video link:', error);
      this.showToast('Could not fetch video link');
    }
  }

  private async openYouTubeVideo(url: string): Promise<void> {
    try {
      const targetUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        await chrome.tabs.update(tab.id, { url: targetUrl });
        this.showToast('Loading video in current window...');
      } else {
        await chrome.tabs.create({ url: targetUrl });
        this.showToast('Loading video...');
      }
    } catch (error) {
      console.error('Failed to open YouTube video:', error);
      this.showToast('Failed to load video');
    }
  }

  private async insertFacebookLink(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        this.showToast('No active tab found');
        return;
      }

      if (!isFacebookUrl(tab.url)) {
        this.showToast('Current tab is not Facebook');
        return;
      }

      let targetUrl = tab.url;

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // 1. Check if current page is directly on a reel or has /reel/ in URL
            const reelPathMatch = window.location.pathname.match(/\/(?:reel|reels)\/([a-zA-Z0-9_-]+)/);
            if (reelPathMatch && reelPathMatch[1]) {
              return `https://www.facebook.com/reel/${reelPathMatch[1]}`;
            }

            // 2. Find active video (Reel, feed, dialog)
            const videos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
            let activeVideo: HTMLVideoElement | null = videos.find((v) => !v.paused && v.currentTime > 0) || null;
            if (!activeVideo && videos.length > 0) {
              const viewCenterX = window.innerWidth / 2;
              const viewCenterY = window.innerHeight / 2;
              let bestScore = -Infinity;
              for (const v of videos) {
                const rect = v.getBoundingClientRect();
                const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
                const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
                const visibleArea = visibleWidth * visibleHeight;
                if (visibleArea <= 0) continue;
                const distFromCenter = Math.hypot(rect.left + rect.width / 2 - viewCenterX, rect.top + rect.height / 2 - viewCenterY);
                let score = visibleArea - distFromCenter * 50;
                if (v.currentTime > 0) score += 50000;
                if (score > bestScore) {
                  bestScore = score;
                  activeVideo = v;
                }
              }
            }

            // 3. Check if active video container has a reel or video anchor
            if (activeVideo) {
              let el: HTMLElement | null = activeVideo;
              while (el && el !== document.body) {
                const reelAnchor = el.querySelector(
                  'a[href*="/reel/"], a[href*="/reels/"], a[href*="/share/r/"]'
                ) as HTMLAnchorElement | null;
                if (reelAnchor && reelAnchor.href) return reelAnchor.href;

                const videoAnchor = el.querySelector(
                  'a[href*="/watch/"], a[href*="/videos/"], a[href*="/posts/"], a[href*="permalink.php"], a[href*="story.php"]'
                ) as HTMLAnchorElement | null;
                if (videoAnchor && videoAnchor.href) return videoAnchor.href;

                el = el.parentElement;
              }
            }

            // 4. Check modal dialog first (theater mode)
            const dialog = document.querySelector('div[role="dialog"]');
            if (dialog) {
              const permalink = dialog.querySelector(
                'a[href*="/reel/"], a[href*="/reels/"], a[href*="/watch/"], a[href*="/videos/"], a[href*="/posts/"], a[href*="permalink.php"], a[href*="story.php"]'
              ) as HTMLAnchorElement | null;
              if (permalink && permalink.href) return permalink.href;
            }

            // 5. Check visible reel anchors
            const reelAnchors = Array.from(document.querySelectorAll('a[href*="/reel/"], a[href*="/reels/"]')) as HTMLAnchorElement[];
            for (const a of reelAnchors) {
              const rect = a.getBoundingClientRect();
              if (rect.top >= -200 && rect.top <= window.innerHeight) {
                return a.href;
              }
            }

            // 6. Check most visible post article
            const articles = Array.from(document.querySelectorAll('div[role="article"]')) as HTMLElement[];
            for (const art of articles) {
              const rect = art.getBoundingClientRect();
              if (rect.top >= -100 && rect.top <= window.innerHeight / 2) {
                const anchor = art.querySelector(
                  'a[href*="/posts/"], a[href*="/videos/"], a[href*="/reel/"], a[href*="/watch/"], a[href*="permalink.php"], a[href*="story.php"]'
                ) as HTMLAnchorElement | null;
                if (anchor && anchor.href) return anchor.href;
              }
            }

            const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
            const ogUrl = document.querySelector('meta[property="og:url"]')?.getAttribute('content');
            return canonical || ogUrl || window.location.href;
          },
        });

        const pageUrl = results?.[0]?.result;
        if (pageUrl && typeof pageUrl === 'string') {
          targetUrl = pageUrl;
        }
      } catch (scriptErr) {
        console.error('Failed to query Facebook tab data:', scriptErr);
      }

      if (!targetUrl || targetUrl === 'https://www.facebook.com/' || targetUrl === 'https://www.facebook.com') {
        this.showToast('No Facebook video or post detected');
        return;
      }

      const permanentUrl = cleanFacebookUrl(targetUrl);
      this.insertTextAtCursor(`${permanentUrl}\n`);
      this.showToast(`Inserted: ${permanentUrl}`);
    } catch (error) {
      console.error('Failed to insert Facebook link:', error);
      this.showToast('Could not fetch Facebook link');
    }
  }

  private async openFacebookUrl(url: string): Promise<void> {
    try {
      const targetUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        await chrome.tabs.update(tab.id, { url: targetUrl });
        this.showToast('Loading Facebook in current window...');
      } else {
        await chrome.tabs.create({ url: targetUrl });
        this.showToast('Loading Facebook...');
      }
    } catch (error) {
      console.error('Failed to open Facebook URL:', error);
      this.showToast('Failed to load Facebook URL');
    }
  }

  private async insertTimestamp(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        this.showToast('No active tab found');
        return;
      }

      const onYouTube = isYouTubeUrl(tab.url);
      const onFacebook = isFacebookUrl(tab.url);
      const onLocalFile = !!tab.url?.startsWith('file://');

      let currentTime: number | null = null;

      if (onYouTube) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const video = (document.querySelector('video.html5-main-video') ||
              document.querySelector('video')) as HTMLVideoElement | null;
            if (!video) return null;
            return video.currentTime;
          },
        });
        currentTime = results?.[0]?.result ?? null;
      } else if (onFacebook) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const videos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
            if (videos.length === 0) return null;
            if (videos.length === 1) return videos[0].currentTime;

            // 1. Any currently playing video
            const playing = videos.find((v) => !v.paused && v.currentTime > 0);
            if (playing) return playing.currentTime;

            // 2. Video in dialog/modal if visible
            const dialogVideo = document.querySelector('div[role="dialog"] video') as HTMLVideoElement | null;
            if (dialogVideo) {
              const rect = dialogVideo.getBoundingClientRect();
              if (rect.width > 50 && rect.height > 50 && rect.bottom > 0 && rect.top < window.innerHeight) {
                return dialogVideo.currentTime;
              }
            }

            // 3. Find video closest to viewport center (handles Reels and feed videos even when paused)
            const viewCenterX = window.innerWidth / 2;
            const viewCenterY = window.innerHeight / 2;

            let bestVideo: HTMLVideoElement | null = null;
            let bestScore = -Infinity;

            for (const v of videos) {
              const rect = v.getBoundingClientRect();
              const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
              const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
              const visibleArea = visibleWidth * visibleHeight;
              if (visibleArea <= 0) continue;

              const vidCenterX = rect.left + rect.width / 2;
              const vidCenterY = rect.top + rect.height / 2;
              const distFromCenter = Math.hypot(vidCenterX - viewCenterX, vidCenterY - viewCenterY);

              let score = visibleArea - distFromCenter * 50;
              if (v.currentTime > 0) score += 50000;
              if (!v.paused) score += 500000;

              if (score > bestScore) {
                bestScore = score;
                bestVideo = v;
              }
            }

            return bestVideo ? bestVideo.currentTime : (videos[0] ? videos[0].currentTime : null);
          },
        });
        currentTime = results?.[0]?.result ?? null;
      } else {
        // Local video or audio, or any tab with HTML5 media
        if (onLocalFile) {
          const isAllowed = await chrome.extension.isAllowedFileSchemeAccess().catch(() => false);
          if (!isAllowed) {
            this.showToast('Please enable "Allow access to file URLs" in chrome://extensions');
            return;
          }
        }

        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const mediaElements = Array.from(
                document.querySelectorAll('video, audio')
              ) as (HTMLVideoElement | HTMLAudioElement)[];
              if (mediaElements.length === 0) return null;

              // 1. Any currently playing media
              const playing = mediaElements.find((m) => !m.paused && m.currentTime > 0);
              if (playing) return playing.currentTime;

              // 2. Any media with currentTime > 0
              const progressing = mediaElements.find((m) => m.currentTime > 0);
              if (progressing) return progressing.currentTime;

              // 3. First media element
              return mediaElements[0].currentTime;
            },
          });
          currentTime = results?.[0]?.result ?? null;
        } catch (scriptErr) {
          console.error('Failed to query local media currentTime:', scriptErr);
        }
      }

      if (typeof currentTime !== 'number' || isNaN(currentTime)) {
        this.showToast('No video or audio found on page');
        return;
      }

      const formatted = formatTimestamp(currentTime);
      this.insertTextAtCursor(`${formatted} `);
      this.showToast(`Inserted: ${formatted}`);
    } catch (error) {
      console.error('Failed to fetch media timestamp:', error);
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

    // Check if user Ctrl+clicked (or Cmd+clicked) on a local media link, YouTube, or Facebook URL
    if (e.ctrlKey || e.metaKey) {
      let localUrl = getLocalMediaUrlAtPosition(this.textarea.value, pos);
      if (!localUrl && this.textarea.selectionEnd !== pos) {
        localUrl = getLocalMediaUrlAtPosition(this.textarea.value, this.textarea.selectionEnd);
      }
      if (localUrl) {
        await this.openLocalMedia(localUrl);
        return;
      }

      let ytUrl = getYouTubeUrlAtPosition(this.textarea.value, pos);
      if (!ytUrl && this.textarea.selectionEnd !== pos) {
        ytUrl = getYouTubeUrlAtPosition(this.textarea.value, this.textarea.selectionEnd);
      }
      if (ytUrl) {
        await this.openYouTubeVideo(ytUrl);
        return;
      }

      let fbUrl = getFacebookUrlAtPosition(this.textarea.value, pos);
      if (!fbUrl && this.textarea.selectionEnd !== pos) {
        fbUrl = getFacebookUrlAtPosition(this.textarea.value, this.textarea.selectionEnd);
      }
      if (fbUrl) {
        await this.openFacebookUrl(fbUrl);
        return;
      }
    }

    const ts = getTimestampAtPosition(this.textarea.value, pos);
    if (ts) {
      this.showQuickJump(ts);
      // Only jump if the user does Ctrl+Click (or Cmd+Click) on the timestamp
      if (e.ctrlKey || e.metaKey) {
        await this.seekVideo(ts);
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
    this.quickJumpText.textContent = `Jump media to ${timestamp}`;
    this.quickJumpBtn.title = `Jump media to ${timestamp}`;
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

    this.quickJumpText.textContent = `Jump media to ${this.activeTimestamp}`;
    this.quickJumpBtn.title = `Jump media to ${this.activeTimestamp}`;
    this.timestampBar.classList.remove('hidden');
  }

  private async seekVideo(timestamp: string): Promise<boolean> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        this.showToast('No active tab found');
        return false;
      }

      const onYouTube = isYouTubeUrl(tab.url);
      const onFacebook = isFacebookUrl(tab.url);
      const onLocalFile = !!tab.url?.startsWith('file://');
      const targetSeconds = parseTimestampToSeconds(timestamp);

      if (onYouTube) {
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
      } else if (onFacebook) {
        const isReel = !!(tab.url && (tab.url.includes('/reel/') || tab.url.includes('/reels/')));
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          args: [targetSeconds],
          func: (seconds: number) => {
            const videos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
            if (videos.length === 0) return false;

            let target: HTMLVideoElement | null = null;

            if (videos.length === 1) {
              target = videos[0];
            } else {
              target = videos.find((v) => !v.paused && v.currentTime > 0) || null;

              if (!target) {
                const dialogVideo = document.querySelector('div[role="dialog"] video') as HTMLVideoElement | null;
                if (dialogVideo) {
                  const rect = dialogVideo.getBoundingClientRect();
                  if (rect.width > 50 && rect.height > 50 && rect.bottom > 0 && rect.top < window.innerHeight) {
                    target = dialogVideo;
                  }
                }
              }

              if (!target) {
                const viewCenterX = window.innerWidth / 2;
                const viewCenterY = window.innerHeight / 2;
                let bestScore = -Infinity;

                for (const v of videos) {
                  const rect = v.getBoundingClientRect();
                  const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
                  const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
                  const visibleArea = visibleWidth * visibleHeight;
                  if (visibleArea <= 0) continue;

                  const vidCenterX = rect.left + rect.width / 2;
                  const vidCenterY = rect.top + rect.height / 2;
                  const distFromCenter = Math.hypot(vidCenterX - viewCenterX, vidCenterY - viewCenterY);

                  let score = visibleArea - distFromCenter * 50;
                  if (v.currentTime > 0) score += 50000;
                  if (!v.paused) score += 500000;

                  if (score > bestScore) {
                    bestScore = score;
                    target = v;
                  }
                }
              }
            }

            if (!target) {
              target = videos[0] || null;
            }

            if (!target) return false;

            target.currentTime = seconds;
            target.dispatchEvent(new Event('seeking', { bubbles: true }));
            target.dispatchEvent(new Event('seeked', { bubbles: true }));
            target.dispatchEvent(new Event('timeupdate', { bubbles: true }));
            return true;
          },
        });

        const success = results?.[0]?.result;
        if (success) {
          this.showToast(isReel ? `Jumped reel to ${timestamp}` : `Jumped Facebook video to ${timestamp}`);
          return true;
        } else {
          this.showToast(isReel ? 'No reel video found' : 'No Facebook video found');
          return false;
        }
      } else {
        // Local media or any tab with HTML5 media
        if (onLocalFile) {
          const isAllowed = await chrome.extension.isAllowedFileSchemeAccess().catch(() => false);
          if (!isAllowed) {
            this.showToast('Please enable "Allow access to file URLs" in chrome://extensions');
            return false;
          }
        }

        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            args: [targetSeconds],
            func: (seconds: number) => {
              const mediaElements = Array.from(
                document.querySelectorAll('video, audio')
              ) as (HTMLVideoElement | HTMLAudioElement)[];
              if (mediaElements.length === 0) return false;

              let target: HTMLMediaElement | null =
                mediaElements.find((m) => !m.paused && m.currentTime > 0) || null;

              if (!target) {
                target = mediaElements.find((m) => m.currentTime > 0) || null;
              }

              if (!target) {
                target = mediaElements[0] || null;
              }

              if (!target) return false;

              target.currentTime = seconds;
              target.dispatchEvent(new Event('seeking', { bubbles: true }));
              target.dispatchEvent(new Event('seeked', { bubbles: true }));
              target.dispatchEvent(new Event('timeupdate', { bubbles: true }));
              return true;
            },
          });

          const success = results?.[0]?.result;
          if (success) {
            this.showToast(`Jumped media to ${timestamp}`);
            return true;
          } else {
            this.showToast('No media player found in tab');
            return false;
          }
        } catch (scriptErr) {
          console.error('Failed to seek media:', scriptErr);
          this.showToast('Failed to jump media');
          return false;
        }
      }
    } catch (error) {
      console.error('Failed to seek media:', error);
      this.showToast('Failed to jump media');
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

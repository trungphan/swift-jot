interface StorageData {
  swiftJotNote?: string;
}

const STORAGE_KEY = 'swiftJotNote';
const DEBOUNCE_DELAY_MS = 300;

class SwiftJotPopup {
  private textarea: HTMLTextAreaElement;
  private saveStatus: HTMLElement;
  private charCountEl: HTMLElement;
  private wordCountEl: HTMLElement;
  private copyBtn: HTMLButtonElement;
  private clearBtn: HTMLButtonElement;
  private toastEl: HTMLElement;

  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.textarea = document.getElementById('note-textarea') as HTMLTextAreaElement;
    this.saveStatus = document.getElementById('save-status') as HTMLElement;
    this.charCountEl = document.getElementById('char-count') as HTMLElement;
    this.wordCountEl = document.getElementById('word-count') as HTMLElement;
    this.copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
    this.clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
    this.toastEl = document.getElementById('toast') as HTMLElement;

    this.init();
  }

  private async init(): Promise<void> {
    await this.loadNote();
    this.bindEvents();
    this.updateCounters(this.textarea.value);
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
    });

    this.copyBtn.addEventListener('click', async () => {
      await this.copyToClipboard();
    });

    this.clearBtn.addEventListener('click', async () => {
      await this.clearNote();
    });
  }

  private handleInput(): void {
    const text = this.textarea.value;
    this.updateCounters(text);
    this.setSaveStatus('Saving...');

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      await this.saveNote(text);
    }, DEBOUNCE_DELAY_MS);
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

/**
 * Text Scramble Reveal Effect
 * Reveals header text with scramble animation on scroll
 */

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*<>[]{}';

class TextScramble {
  constructor(element) {
    this.element = element;
    this.originalHTML = element.innerHTML;
    this.originalText = element.textContent;
    this.frameRequest = null;
    this.queue = [];
    this.frame = 0;
    this.isRevealed = false;

    // Store original text for accessibility
    element.setAttribute('aria-label', this.originalText);
  }

  reveal() {
    if (this.isRevealed) return;
    this.isRevealed = true;
    this.cancelAnimation();
    this.animateTo(this.originalText);
  }

  scramble() {
    if (!this.isRevealed) return;
    this.isRevealed = false;
    this.cancelAnimation();
    this.setScrambled();
  }

  setScrambled() {
    // Immediately set to scrambled state
    const scrambled = this.originalText
      .split('')
      .map(char => char === ' ' || char === '\n' ? char : this.randomChar())
      .join('');
    this.updateText(scrambled);
  }

  animateTo(targetText) {
    const currentText = this.element.textContent;
    const length = Math.max(currentText.length, targetText.length);
    this.queue = [];

    for (let i = 0; i < length; i++) {
      const from = currentText[i] || '';
      const to = targetText[i] || '';
      // Stagger the start times for left-to-right reveal
      const start = i * 2;
      const end = start + 10 + Math.floor(Math.random() * 10);
      this.queue.push({ from, to, start, end, char: '' });
    }

    this.frame = 0;
    this.update();
  }

  update() {
    let output = '';
    let complete = 0;

    for (let i = 0; i < this.queue.length; i++) {
      const { from, to, start, end } = this.queue[i];
      let { char } = this.queue[i];

      if (this.frame >= end) {
        complete++;
        output += to;
      } else if (this.frame >= start) {
        // Only randomize non-space characters
        if (to !== ' ' && to !== '\n') {
          if (!char || Math.random() < 0.28) {
            char = this.randomChar();
            this.queue[i].char = char;
          }
          output += char;
        } else {
          output += to;
        }
      } else {
        output += from;
      }
    }

    this.updateText(output);

    if (complete < this.queue.length) {
      this.frameRequest = requestAnimationFrame(() => {
        this.frame++;
        this.update();
      });
    }
  }

  updateText(text) {
    // Handle the hero title's <br> tag
    if (this.originalHTML.includes('<br>')) {
      // Split at the line break position and reconstruct with <br>
      const brIndex = this.originalText.indexOf('\n');
      if (brIndex !== -1) {
        const before = text.substring(0, brIndex);
        const after = text.substring(brIndex + 1);
        this.element.innerHTML = before + '<br>' + after;
      } else {
        // Fallback: find original <br> position
        const parts = this.originalHTML.split('<br>');
        if (parts.length === 2) {
          const firstLen = parts[0].length;
          const before = text.substring(0, firstLen);
          const after = text.substring(firstLen);
          this.element.innerHTML = before + '<br>' + after;
        } else {
          this.element.textContent = text;
        }
      }
    } else {
      this.element.textContent = text;
    }
  }

  randomChar() {
    return CHARS[Math.floor(Math.random() * CHARS.length)];
  }

  cancelAnimation() {
    if (this.frameRequest) {
      cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
    }
  }
}

class ScrambleManager {
  constructor() {
    this.scramblers = new Map();
    this.observer = null;
    this.init();
  }

  init() {
    // Header configurations
    const headers = [
      { selector: '.hero-title', isHero: true },
      { selector: '.story-title', isHero: false },
      { selector: '.accelerator-title', isHero: false },
      { selector: '.team-title', isHero: false }
    ];

    // Create intersection observer
    this.observer = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      { threshold: 0.3 }
    );

    // Initialize each header
    headers.forEach(({ selector, isHero }) => {
      const element = document.querySelector(selector);
      if (element) {
        this.initHeader(element, isHero);
      }
    });
  }

  initHeader(element, isHero) {
    const scrambler = new TextScramble(element);
    this.scramblers.set(element, scrambler);

    // Start scrambled
    scrambler.setScrambled();

    if (isHero) {
      // Hero is visible on load - reveal after delay
      setTimeout(() => {
        scrambler.reveal();
      }, 400);
    }

    // Observe for scroll interactions
    this.observer.observe(element);
  }

  handleIntersection(entries) {
    entries.forEach(entry => {
      const scrambler = this.scramblers.get(entry.target);
      if (!scrambler) return;

      if (entry.isIntersecting) {
        // Entering viewport - reveal
        scrambler.reveal();
      } else {
        // Exiting viewport in any direction - scramble
        scrambler.scramble();
      }
    });
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ScrambleManager());
} else {
  new ScrambleManager();
}

export default ScrambleManager;

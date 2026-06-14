/**
 * PhotoStackRenderer.ts
 *
 * Instax/Polaroid-style card stack renderer for Synology photo URLs.
 */

import type { ModuleConfig } from '../types';

interface StackCard {
  element: HTMLDivElement;
}

export default class PhotoStackRenderer {
  private readonly config: ModuleConfig;

  private cards: StackCard[] = [];

  constructor(config: ModuleConfig) {
    this.config = config;
  }

  createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'syninsta-stack-container';

    const box = this.computePhotoBox();
    container.style.setProperty('--syninsta-photo-width', `${box.width}px`);
    container.style.setProperty('--syninsta-photo-height', `${box.height}px`);
    container.style.setProperty(
      '--syninsta-frame-width',
      `${this.config.frameWidth}px`
    );
    container.style.setProperty(
      '--syninsta-frame-color',
      this.config.frameColor
    );
    container.style.setProperty(
      '--syninsta-background-color',
      this.config.stackBackgroundColor
    );
    container.style.setProperty(
      '--syninsta-fly-in-duration',
      `${this.config.flyInDuration}ms`
    );
    container.style.setProperty(
      '--syninsta-fly-out-duration',
      `${this.config.flyOutDuration}ms`
    );

    this.applyPosition(container);
    return container;
  }

  addCard(container: HTMLElement, image: HTMLImageElement): HTMLDivElement {
    const entries = [
      { x: '120vw', y: '-60vh' },
      { x: '-120vw', y: '-60vh' },
      { x: '0vw', y: '-150vh' },
      { x: '120vw', y: '0vh' }
    ];
    const entry = entries[Math.floor(Math.random() * entries.length)];

    const card = document.createElement('div');
    card.className = 'syninsta-card syninsta-fly-in';
    card.style.setProperty(
      '--syninsta-rest-x',
      `${this.randomBetween(-this.config.maxOffset, this.config.maxOffset).toFixed(2)}px`
    );
    card.style.setProperty(
      '--syninsta-rest-y',
      `${this.randomBetween(-this.config.maxOffset, this.config.maxOffset).toFixed(2)}px`
    );
    card.style.setProperty(
      '--syninsta-rest-rotate',
      `${this.randomBetween(-this.config.maxRotation, this.config.maxRotation).toFixed(2)}deg`
    );
    card.style.setProperty('--syninsta-in-x', entry.x);
    card.style.setProperty('--syninsta-in-y', entry.y);

    const img = document.createElement('img');
    img.className = 'syninsta-image';
    img.alt = '';
    img.src = image.src;
    this.sizeImage(img, image);
    card.appendChild(img);

    for (const existing of this.cards) {
      const z = parseInt(existing.element.style.zIndex, 10) || 0;
      existing.element.style.zIndex = String(z - 1);
    }

    card.style.zIndex = String(this.config.stackSize);
    container.appendChild(card);
    this.cards.push({ element: card });

    const settle = (): void => card.classList.remove('syninsta-fly-in');
    card.addEventListener('animationend', (event) => {
      if (event.animationName === 'syninsta-fly-in') {
        settle();
      }
    });
    window.setTimeout(settle, this.config.flyInDuration + 50);

    while (this.cards.length > this.config.stackSize) {
      const oldest = this.cards.shift();
      if (oldest) {
        this.removeOldestCard(oldest.element);
      }
    }

    return card;
  }

  settleInFlightCards(container: HTMLElement): void {
    const flying = container.querySelectorAll('.syninsta-card.syninsta-fly-in');
    for (const element of Array.from(flying)) {
      element.classList.remove('syninsta-fly-in');
    }
  }

  private applyPosition(container: HTMLElement): void {
    const { style } = container;
    style.width = this.toCssLength(this.config.stackWidth);
    style.height = this.toCssLength(this.config.stackHeight);
    style.position = this.config.stackFixed ? 'fixed' : 'relative';
    style.top = this.config.stackTop;
    style.right = this.config.stackRight;
    style.bottom = this.config.stackBottom;
    style.left = this.config.stackLeft;
    style.transform = this.config.stackTransform;
    style.zIndex = String(this.config.stackZIndex);
  }

  private computePhotoBox(): { width: number; height: number } {
    if (this.config.photoWidth !== null && this.config.photoHeight !== null) {
      return { width: this.config.photoWidth, height: this.config.photoHeight };
    }

    const containerWidth = this.parseLength(
      this.config.stackWidth,
      window.innerWidth
    );
    const containerHeight = this.parseLength(
      this.config.stackHeight,
      window.innerHeight
    );
    const frame = this.config.frameWidth;
    const chromeW = frame * 2;
    const chromeH = frame * 3.5;
    const theta = (this.config.maxRotation * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const offset = this.config.maxOffset;
    const availableWidth = containerWidth - 2 * offset;
    const availableHeight = containerHeight - 2 * offset;
    const aspect = containerWidth / containerHeight;

    const cardW = Math.min(
      availableWidth / (cos + aspect * sin),
      availableHeight / (sin + aspect * cos)
    );
    const width =
      this.config.photoWidth ?? Math.max(1, Math.round(cardW - chromeW));
    const height =
      this.config.photoHeight ??
      Math.max(1, Math.round(cardW / aspect - chromeH));

    return { width, height };
  }

  private sizeImage(
    img: HTMLImageElement,
    loadedImage: HTMLImageElement
  ): void {
    const aspect =
      loadedImage.naturalWidth && loadedImage.naturalHeight
        ? loadedImage.naturalWidth / loadedImage.naturalHeight
        : window.innerWidth / window.innerHeight;
    const box = this.fitPhotoToContainer(aspect);
    img.style.maxWidth = `${box.width}px`;
    img.style.maxHeight = `${box.height}px`;
  }

  private fitPhotoToContainer(aspect: number): {
    width: number;
    height: number;
  } {
    const containerWidth = this.parseLength(
      this.config.stackWidth,
      window.innerWidth
    );
    const containerHeight = this.parseLength(
      this.config.stackHeight,
      window.innerHeight
    );
    const frame = this.config.frameWidth;
    const theta = (this.config.maxRotation * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const offset = this.config.maxOffset;
    const boundsWidth = containerWidth - 2 * offset;
    const boundsHeight = containerHeight - 2 * offset;
    const wFromWidth =
      (boundsWidth - frame * (2 * cos + 3.5 * sin)) / (cos + sin / aspect);
    const wFromHeight =
      (boundsHeight - frame * (2 * sin + 3.5 * cos)) / (sin + cos / aspect);
    let width = Math.min(wFromWidth, wFromHeight);

    if (this.config.photoWidth !== null) {
      width = Math.min(width, this.config.photoWidth);
    }
    if (this.config.photoHeight !== null) {
      width = Math.min(width, this.config.photoHeight * aspect);
    }

    width = Math.max(1, Math.floor(width));
    const height = Math.max(1, Math.floor(width / aspect));
    return { width, height };
  }

  private removeOldestCard(element: HTMLDivElement): void {
    element.classList.add('syninsta-fly-out');
    window.setTimeout(() => {
      element.parentNode?.removeChild(element);
    }, this.config.flyOutDuration);
  }

  private parseLength(value: string | number, relativeTo: number): number {
    if (typeof value === 'number') {
      return value;
    }
    if (value.endsWith('vw')) {
      return (parseFloat(value) / 100) * window.innerWidth;
    }
    if (value.endsWith('vh')) {
      return (parseFloat(value) / 100) * window.innerHeight;
    }
    if (value.endsWith('%')) {
      return (parseFloat(value) / 100) * relativeTo;
    }
    return parseFloat(value) || relativeTo;
  }

  private toCssLength(value: string | number): string {
    return typeof value === 'number' ? `${value}px` : value;
  }

  private randomBetween(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }
}

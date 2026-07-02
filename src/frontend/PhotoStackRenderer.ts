/**
 * PhotoStackRenderer.ts
 *
 * Instax/Polaroid-style card stack renderer for Synology photo URLs.
 */

import type { ModuleConfig } from '../types';

interface StackCard {
  element: HTMLDivElement;
}

type StackMediaElement = HTMLImageElement | HTMLVideoElement;

interface CardOptions {
  caption?: string;
  animate?: boolean;
}

const WIDE_PHOTO_ASPECT = 16 / 9;
const LANDSCAPE_PHOTO_ASPECT = 4 / 3;
const PORTRAIT_PHOTO_ASPECT = 3 / 4;
const TALL_PHOTO_ASPECT = 9 / 16;

export default class PhotoStackRenderer {
  private readonly config: ModuleConfig;

  private cards: StackCard[] = [];

  constructor(config: ModuleConfig) {
    this.config = config;
  }

  createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'syninstax-stack-container';

    const box = this.computePhotoBox(LANDSCAPE_PHOTO_ASPECT);
    const { frameWidth } = this.config;
    const footerHeight = frameWidth * 3.75;
    const captionFontSize = Math.min(42, Math.max(18, frameWidth * 1.75));

    container.style.setProperty('--syninstax-photo-width', `${box.width}px`);
    container.style.setProperty('--syninstax-photo-height', `${box.height}px`);
    container.style.setProperty('--syninstax-frame-width', `${frameWidth}px`);
    container.style.setProperty(
      '--syninstax-footer-height',
      `${footerHeight}px`
    );
    container.style.setProperty(
      '--syninstax-caption-font-size',
      `${captionFontSize}px`
    );
    container.style.setProperty(
      '--syninstax-frame-color',
      this.config.frameColor
    );
    container.style.setProperty(
      '--syninstax-background-color',
      this.config.stackBackgroundColor
    );
    container.style.setProperty(
      '--syninstax-fly-in-duration',
      `${this.config.flyInDuration}ms`
    );
    container.style.setProperty(
      '--syninstax-fly-out-duration',
      `${this.config.flyOutDuration}ms`
    );

    this.applyPosition(container);
    return container;
  }

  getCardCount(): number {
    return this.cards.length;
  }

  addCard(
    container: HTMLElement,
    image: HTMLImageElement,
    options: CardOptions = {}
  ): HTMLDivElement {
    const img = document.createElement('img');
    img.className = 'syninstax-media syninstax-image';
    img.alt = '';
    img.src = image.src;
    this.sizeMedia(img, this.getMediaAspect(image));
    return this.addMediaCard(container, img, options);
  }

  addVideoCard(
    container: HTMLElement,
    videoUrl: string,
    mimeType = 'video/mp4',
    options: CardOptions = {}
  ): HTMLDivElement {
    const video = document.createElement('video');
    video.className = 'syninstax-media syninstax-video';
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const source = document.createElement('source');
    source.src = videoUrl;
    source.type = mimeType;
    video.appendChild(source);

    this.sizeMedia(video, LANDSCAPE_PHOTO_ASPECT);
    video.addEventListener('loadedmetadata', () => {
      this.sizeMedia(video, this.getMediaAspect(video));
      void video.play();
    });

    return this.addMediaCard(container, video, options);
  }

  settleInFlightCards(container: HTMLElement): void {
    const flying = container.querySelectorAll(
      '.syninstax-card.syninstax-fly-in'
    );
    for (const element of Array.from(flying)) {
      element.classList.remove('syninstax-fly-in');
    }
  }

  private addMediaCard(
    container: HTMLElement,
    media: StackMediaElement,
    options: CardOptions
  ): HTMLDivElement {
    const entries = [
      { x: '120vw', y: '-60vh' },
      { x: '-120vw', y: '-60vh' },
      { x: '0vw', y: '-150vh' },
      { x: '120vw', y: '0vh' }
    ];
    const entry = entries[Math.floor(Math.random() * entries.length)];

    const card = document.createElement('div');
    card.className = 'syninstax-card syninstax-fly-in';
    card.style.setProperty(
      '--syninstax-rest-x',
      `${this.randomBetween(-this.config.maxOffset, this.config.maxOffset).toFixed(2)}px`
    );
    card.style.setProperty(
      '--syninstax-rest-y',
      `${this.randomBetween(-this.config.maxOffset, this.config.maxOffset).toFixed(2)}px`
    );
    card.style.setProperty(
      '--syninstax-rest-rotate',
      `${this.randomBetween(-this.config.maxRotation, this.config.maxRotation).toFixed(2)}deg`
    );
    card.style.setProperty('--syninstax-in-x', entry.x);
    card.style.setProperty('--syninstax-in-y', entry.y);
    card.appendChild(media);
    if (options.caption) {
      const caption = document.createElement('div');
      caption.className = 'syninstax-caption';
      caption.textContent = options.caption;
      card.appendChild(caption);
    }

    if (options.animate === false) {
      card.classList.remove('syninstax-fly-in');
    }

    for (const existing of this.cards) {
      for (const video of Array.from(
        existing.element.querySelectorAll('video')
      )) {
        video.pause();
      }
      const z = parseInt(existing.element.style.zIndex, 10) || 0;
      existing.element.style.zIndex = String(z - 1);
    }

    card.style.zIndex = String(this.config.stackSize);
    container.appendChild(card);
    this.cards.push({ element: card });

    if (options.animate !== false) {
      const settle = (): void => card.classList.remove('syninstax-fly-in');
      card.addEventListener('animationend', (event) => {
        if (event.animationName === 'syninstax-fly-in') {
          settle();
        }
      });
      window.setTimeout(settle, this.config.flyInDuration + 50);
    }

    while (this.cards.length > this.config.stackSize) {
      const oldest = this.cards.shift();
      if (oldest) {
        this.removeOldestCard(oldest.element);
      }
    }

    return card;
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

  private computePhotoBox(targetAspect: number): {
    width: number;
    height: number;
  } {
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
    const theta = (this.config.maxRotation * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const offset = this.config.maxOffset;
    const availableWidth = containerWidth - 2 * offset;
    const availableHeight = containerHeight - 2 * offset;
    const wFromWidth =
      (availableWidth - frame * (2 * cos + 4.75 * sin)) /
      (cos + sin / targetAspect);
    const wFromHeight =
      (availableHeight - frame * (2 * sin + 4.75 * cos)) /
      (sin + cos / targetAspect);
    let width = Math.min(wFromWidth, wFromHeight);

    if (this.config.photoWidth !== null) {
      width = Math.min(width, this.config.photoWidth);
    }
    if (this.config.photoHeight !== null) {
      width = Math.min(width, this.config.photoHeight * targetAspect);
    }

    width = Math.max(1, Math.floor(width));
    const height = Math.max(1, Math.floor(width / targetAspect));

    return { width, height };
  }

  private sizeMedia(media: StackMediaElement, sourceAspect: number): void {
    const box = this.computePhotoBox(this.getFrameAspect(sourceAspect));
    media.style.width = `${box.width}px`;
    media.style.height = `${box.height}px`;
    media.style.maxWidth = `${box.width}px`;
    media.style.maxHeight = `${box.height}px`;
  }

  private getMediaAspect(media: StackMediaElement): number {
    if (media instanceof HTMLVideoElement) {
      return media.videoWidth && media.videoHeight
        ? media.videoWidth / media.videoHeight
        : LANDSCAPE_PHOTO_ASPECT;
    }

    return media.naturalWidth && media.naturalHeight
      ? media.naturalWidth / media.naturalHeight
      : LANDSCAPE_PHOTO_ASPECT;
  }

  private getFrameAspect(sourceAspect: number): number {
    if (sourceAspect >= 1.55) {
      return WIDE_PHOTO_ASPECT;
    }

    if (sourceAspect >= 1) {
      return LANDSCAPE_PHOTO_ASPECT;
    }

    if (sourceAspect <= 0.65) {
      return TALL_PHOTO_ASPECT;
    }

    return PORTRAIT_PHOTO_ASPECT;
  }

  private removeOldestCard(element: HTMLDivElement): void {
    element.classList.add('syninstax-fly-out');
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

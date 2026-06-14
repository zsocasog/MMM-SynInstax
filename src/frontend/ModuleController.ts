/**
 * ModuleController.ts
 *
 * Main controller for the MMM-SynInsta frontend module.
 * Handles module lifecycle, notifications, and UI updates.
 */

import type { ImageInfo, ModuleConfig, PhotoCaptionMetadata } from '../types';
import ConfigValidator from './ConfigValidator';
import ImageHandler from './ImageHandler';
import UIBuilder from './UIBuilder';
import TransitionHandler from './TransitionHandler';
import PhotoStackRenderer from './PhotoStackRenderer';

interface LoggerInterface {
  info: (message: string, ...args: unknown[]) => void;
  log: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

type MomentInterface = (
  date: string,
  format: string
) => { format: (format: string) => string };

interface EXIFInterface {
  getData: (image: HTMLImageElement, callback: () => void) => void;
  getTag: (
    image: HTMLImageElement,
    tag: string
  ) => string | number | number[] | null;
}

interface NotificationCallbacks {
  sendSocketNotification: (notification: string, payload?: unknown) => void;
  sendNotification: (notification: string, payload?: unknown) => void;
  translate: (key: string) => string;
}

/**
 * ModuleController - Main controller for the frontend module
 */
export default class ModuleController {
  private config: ModuleConfig;

  private readonly identifier: string;

  private imageHandler: ImageHandler | null = null;

  private uiBuilder: UIBuilder | null = null;

  private transitionHandler: TransitionHandler | null = null;

  private photoStackRenderer: PhotoStackRenderer | null = null;

  private imagesDiv: HTMLDivElement | null = null;

  private imageInfoDiv: HTMLDivElement | null = null;

  private imageList: string[] = [];

  private imageIndex = 0;

  private playingVideo = false;

  private timer: NodeJS.Timeout | null = null;

  private savedImages: string[] | null = null;

  private savedIndex: number | null = null;

  private readonly callbacks: NotificationCallbacks;

  private readonly Log: LoggerInterface;

  private readonly moment: MomentInterface;

  private readonly EXIF: EXIFInterface;

  constructor(
    config: ModuleConfig,
    identifier: string,
    callbacks: NotificationCallbacks,
    Log: LoggerInterface,
    moment: MomentInterface,
    EXIF: EXIFInterface
  ) {
    this.config = { ...config, identifier };
    this.identifier = identifier;
    this.callbacks = callbacks;
    this.Log = Log;
    this.moment = moment;
    this.EXIF = EXIF;
  }

  /**
   * Initialize the module
   */
  start(): void {
    // Validate and normalize configuration
    this.config = ConfigValidator.validateConfig(this.config);

    // Initialize helper modules
    this.imageHandler = new ImageHandler(this.config);
    this.uiBuilder = new UIBuilder(this.config);
    this.transitionHandler = new TransitionHandler(this.config);
    this.photoStackRenderer = new PhotoStackRenderer(this.config);

    this.playingVideo = false;
  }

  /**
   * Get the DOM wrapper for the module
   */
  getDom(): HTMLElement {
    const wrapper = document.createElement('div');

    this.imagesDiv =
      this.config.displayMode === 'instax' && this.photoStackRenderer
        ? this.photoStackRenderer.createContainer()
        : document.createElement('div');
    if (this.config.displayMode !== 'instax') {
      this.imagesDiv.className = 'images';
    }
    wrapper.appendChild(this.imagesDiv);

    // Add gradients INSIDE imagesDiv so they layer properly
    if (
      this.config.displayMode !== 'instax' &&
      (this.config.gradientDirection === 'vertical' ||
        this.config.gradientDirection === 'both')
    ) {
      this.createGradientDiv('bottom', this.config.gradient, this.imagesDiv);
    }

    if (
      this.config.displayMode !== 'instax' &&
      (this.config.gradientDirection === 'horizontal' ||
        this.config.gradientDirection === 'both')
    ) {
      this.createGradientDiv(
        'right',
        this.config.horizontalGradient,
        this.imagesDiv
      );
    }

    if (
      this.config.displayMode !== 'instax' &&
      this.config.gradientDirection === 'radial'
    ) {
      this.createRadialGradientDiv(
        'ellipse at center',
        this.config.radialGradient,
        this.imagesDiv
      );
    }

    if (this.config.showImageInfo) {
      this.imageInfoDiv = this.createImageInfoDiv(wrapper);
    }

    if (this.config.showProgressBar) {
      this.createProgressbarDiv(wrapper, this.config.slideshowSpeed);
    }

    this.imageList = [];
    this.imageIndex = 0;
    this.updateImageList();

    return wrapper;
  }

  /**
   * Handle notifications received from other modules
   */
  notificationReceived(notification: string): void {
    if (notification === 'BACKGROUNDSLIDESHOW_NEXT') {
      this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_NEXT_IMAGE');
    } else if (notification === 'BACKGROUNDSLIDESHOW_PREV') {
      this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_PREV_IMAGE');
    } else if (notification === 'BACKGROUNDSLIDESHOW_PAUSE') {
      this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_PAUSE');
    } else if (notification === 'BACKGROUNDSLIDESHOW_PLAY') {
      this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_PLAY');
    }
  }

  /**
   * Handle socket notifications from the backend
   */
  socketNotificationReceived(notification: string, payload: unknown): void {
    this.Log.log(
      '[MMM-SynInsta] Frontend received notification:',
      notification,
      payload
    );

    const handlers: Record<string, () => void> = {
      BACKGROUNDSLIDESHOW_READY: () => this.handleReady(payload),
      BACKGROUNDSLIDESHOW_REGISTER_CONFIG: () => this.handleRegisterConfig(),
      BACKGROUNDSLIDESHOW_PLAY: () => this.handlePlay(),
      BACKGROUNDSLIDESHOW_DISPLAY_IMAGE: () => this.handleDisplayImage(payload),
      BACKGROUNDSLIDESHOW_FILELIST: () => this.handleFileList(payload),
      BACKGROUNDSLIDESHOW_UPDATE_IMAGE_LIST: () => this.handleUpdateImageList(),
      BACKGROUNDSLIDESHOW_IMAGE_UPDATE: () => this.handleImageUpdate(),
      BACKGROUNDSLIDESHOW_NEXT: () => this.handleNext(),
      BACKGROUNDSLIDESHOW_PREVIOUS: () => this.handlePrevious(),
      BACKGROUNDSLIDESHOW_PAUSE: () => this.handlePause(),
      BACKGROUNDSLIDESHOW_URL: () => this.handleUrl(payload),
      BACKGROUNDSLIDESHOW_URLS: () => this.handleUrls(payload)
    };

    const handler = handlers[notification];
    if (handler) {
      handler();
    }
  }

  /**
   * Handle READY notification
   */
  private handleReady(payload: unknown): void {
    const typedPayload = payload as { identifier: string };
    this.Log.log(
      '[MMM-SynInsta] READY notification, identifier match:',
      typedPayload.identifier === this.identifier
    );
    if (typedPayload.identifier === this.identifier && !this.playingVideo) {
      this.resume();
    }
  }

  /**
   * Handle REGISTER_CONFIG notification
   */
  private handleRegisterConfig(): void {
    this.Log.log('[MMM-SynInsta] Registering config');
    this.updateImageList();
  }

  /**
   * Handle PLAY notification
   */
  private handlePlay(): void {
    this.Log.log('[MMM-SynInsta] PLAY notification');
    this.updateImage();
    this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_PLAY');
    if (!this.playingVideo) {
      this.resume();
    }
  }

  /**
   * Handle DISPLAY_IMAGE notification
   */
  private handleDisplayImage(payload: unknown): void {
    const typedPayload = payload as ImageInfo;
    this.Log.log(
      '[MMM-SynInsta] DISPLAY_IMAGE notification, identifier match:',
      typedPayload.identifier === this.identifier
    );
    if (typedPayload.identifier === this.identifier) {
      this.displayImage(typedPayload);
    }
  }

  /**
   * Handle FILELIST notification
   */
  private handleFileList(payload: unknown): void {
    this.callbacks.sendNotification('BACKGROUNDSLIDESHOW_FILELIST', payload);
  }

  /**
   * Handle UPDATE_IMAGE_LIST notification
   */
  private handleUpdateImageList(): void {
    this.imageIndex = -1;
    this.updateImageList();
    this.updateImage();
  }

  /**
   * Handle IMAGE_UPDATE notification
   */
  private handleImageUpdate(): void {
    this.Log.log('[MMM-SynInsta] Changing Background');
    this.suspend();
    this.updateImage();
    if (!this.playingVideo) {
      this.resume();
    }
  }

  /**
   * Handle NEXT notification
   */
  private handleNext(): void {
    this.updateImage();
    if (this.timer && !this.playingVideo) {
      this.resume();
    }
  }

  /**
   * Handle PREVIOUS notification
   */
  private handlePrevious(): void {
    this.updateImage(true);
    if (this.timer && !this.playingVideo) {
      this.resume();
    }
  }

  /**
   * Handle PAUSE notification
   */
  private handlePause(): void {
    this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_PAUSE');
  }

  /**
   * Handle URL notification
   */
  private handleUrl(payload: unknown): void {
    const typedPayload = payload as { url?: string; resume?: boolean };
    if (!typedPayload?.url) return;

    if (typedPayload.resume) {
      if (this.timer) {
        this.resume();
      }
    } else {
      this.suspend();
    }
    this.updateImage(false, typedPayload.url);
  }

  /**
   * Handle URLS notification
   */
  private handleUrls(payload: unknown): void {
    this.Log.log(
      `[MMM-SynInsta] Notification Received: BACKGROUNDSLIDESHOW_URLS. Payload: ${JSON.stringify(payload)}`
    );
    const typedPayload = payload as { urls?: string[] };

    if (typedPayload?.urls?.length) {
      this.handleUrlsWithImages(typedPayload.urls);
    } else if (this.savedImages) {
      this.restoreSavedImages();
    }
  }

  /**
   * Handle URLS notification when URLs are provided
   */
  private handleUrlsWithImages(urls: string[]): void {
    if (this.savedImages) {
      const temp = [...new Set([...urls, ...this.imageList])];
      if (temp.length !== urls.length) {
        this.updateImageListWithArray(urls);
      }
    } else {
      this.savedImages = this.imageList;
      this.savedIndex = this.imageIndex;
      this.updateImageListWithArray(urls);
    }
  }

  /**
   * Restore saved images
   */
  private restoreSavedImages(): void {
    this.imageList = this.savedImages!;
    this.imageIndex = this.savedIndex || 0;
    this.savedImages = null;
    this.savedIndex = null;
    this.updateImage();
    if (this.timer && !this.playingVideo) {
      this.resume();
    }
  }

  /**
   * Display an image
   */
  displayImage(imageinfo: ImageInfo): void {
    this.Log.info(
      `[MMM-SynInsta] Frontend displayImage called for: ${imageinfo.path}`
    );
    this.Log.log('[MMM-SynInsta] Frontend displayImage called', imageinfo);

    const mwLc = imageinfo.path.toLowerCase();
    if (mwLc.endsWith('.mp4') || mwLc.endsWith('.m4v')) {
      const payload = [imageinfo.path, 'PLAY'];
      imageinfo.data = 'modules/MMM-SynInsta/transparent1080p.png';
      this.callbacks.sendSocketNotification(
        'BACKGROUNDSLIDESHOW_PLAY_VIDEO',
        payload
      );
      this.playingVideo = true;
      this.suspend();
    } else {
      this.playingVideo = false;
    }

    this.Log.log('[MMM-SynInsta] Creating image element, src:', imageinfo.data);
    const image = new Image();
    image.onload = () => {
      this.handleImageLoad(image, imageinfo);
    };

    image.onerror = (error) => {
      this.Log.error(
        '[MMM-SynInsta] Image failed to load:',
        imageinfo.data,
        error
      );
      this.Log.error(`[MMM-SynInsta] Image failed to load: ${imageinfo.data}`);
    };

    image.src = imageinfo.data;
    this.Log.log('[MMM-SynInsta] Image src set to:', imageinfo.data);
    this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_IMAGE_UPDATED', {
      url: imageinfo.path
    });
  }

  /**
   * Handle image load event
   */
  private handleImageLoad(image: HTMLImageElement, imageinfo: ImageInfo): void {
    this.Log.log(
      '[MMM-SynInsta] Image loaded successfully',
      image.width,
      'x',
      image.height
    );

    if (this.config.displayMode === 'instax') {
      const card = this.photoStackRenderer?.addCard(this.imagesDiv!, image);
      if (card) {
        this.photoStackRenderer?.updateCaption(
          card,
          this.getPhotoCaptionMetadata(image, imageinfo, null)
        );
      }

      if (this.config.showProgressBar) {
        this.uiBuilder?.restartProgressBar();
      }

      setTimeout(() => {
        this.handleEXIFData(image, imageinfo, (metadata) => {
          if (card) {
            this.photoStackRenderer?.updateCaption(card, metadata);
          }
        });
      }, 0);
      return;
    }

    // Clean up old images
    if (this.imagesDiv && this.transitionHandler) {
      this.transitionHandler.cleanupOldImages(this.imagesDiv);
    }

    // Create transition div
    const transitionDiv = this.transitionHandler?.createTransitionDiv();
    if (!transitionDiv) return;

    // Create and configure image div
    const imageDiv = this.imageHandler?.createImageDiv();
    if (!imageDiv) return;

    imageDiv.style.backgroundImage = `url("${image.src}")`;
    this.Log.log('[MMM-SynInsta] Set backgroundImage on imageDiv');
    this.Log.log(
      '[MMM-SynInsta] imageDiv classList:',
      imageDiv.classList.toString()
    );
    this.Log.log(
      '[MMM-SynInsta] imageDiv backgroundSize:',
      imageDiv.style.backgroundSize
    );

    // Apply fit mode (portrait/landscape)
    const useFitMode =
      this.imageHandler?.applyFitMode(imageDiv, image) || false;
    this.Log.log('[MMM-SynInsta] useFitMode:', useFitMode);
    this.Log.log(
      '[MMM-SynInsta] After fitMode, classList:',
      imageDiv.classList.toString()
    );

    // Restart progress bar if enabled
    if (this.config.showProgressBar) {
      this.uiBuilder?.restartProgressBar();
    }

    // Apply animations if not in fit mode
    if (!useFitMode) {
      this.imageHandler?.applyAnimation(imageDiv, image);
    }

    // Handle EXIF data asynchronously
    setTimeout(() => {
      this.handleEXIFData(image, imageinfo);
      this.imageHandler?.applyExifOrientation(imageDiv, image);
    }, 0);

    transitionDiv.appendChild(imageDiv);
    this.imagesDiv?.appendChild(transitionDiv);
    this.Log.log('[MMM-SynInsta] Image appended to DOM');
    this.Log.log(
      '[MMM-SynInsta] imagesDiv children count:',
      this.imagesDiv?.children.length
    );
    this.Log.log('[MMM-SynInsta] imagesDiv styles:', {
      position: this.imagesDiv?.style.position,
      width: this.imagesDiv?.style.width,
      height: this.imagesDiv?.style.height,
      zIndex: this.imagesDiv?.style.zIndex
    });

    // Check if there are gradient divs blocking the view
    const wrapper = this.imagesDiv?.parentElement;
    if (wrapper) {
      this.Log.log(
        '[MMM-SynInsta] Wrapper children count:',
        wrapper.children.length
      );
      this.Log.log(
        '[MMM-SynInsta] Wrapper children types:',
        Array.from(wrapper.children).map((c) => c.className)
      );
    }
  }

  /**
   * Handle EXIF data extraction and image info update
   */
  private handleEXIFData(
    image: HTMLImageElement,
    imageinfo: ImageInfo,
    onMetadata?: (metadata: PhotoCaptionMetadata) => void
  ): void {
    this.EXIF.getData(image, () => {
      const rawDateTime = this.EXIF.getTag(image, 'DateTimeOriginal');
      onMetadata?.(this.getPhotoCaptionMetadata(image, imageinfo, rawDateTime));

      // Update image info if enabled
      if (this.config.showImageInfo && this.imageInfoDiv) {
        let dateTime = rawDateTime;
        if (dateTime !== null) {
          try {
            const dateMoment = this.moment(
              String(dateTime),
              'YYYY:MM:DD HH:mm:ss'
            );
            dateTime = dateMoment.format('dddd MMMM D, YYYY HH:mm');
          } catch {
            this.Log.log(
              `[MMM-SynInsta] Failed to parse dateTime: ${dateTime} to format YYYY:MM:DD HH:mm:ss`
            );
            dateTime = '';
          }
        }
        this.updateImageInfo(imageinfo, String(dateTime || ''));
      }
    });
  }

  private getPhotoCaptionMetadata(
    image: HTMLImageElement,
    imageinfo: ImageInfo,
    rawDateTime: string | number | number[] | null
  ): PhotoCaptionMetadata {
    return {
      date:
        this.formatExifDate(rawDateTime, this.config.photoCaptionDateFormat) ||
        this.formatTimestampDate(
          imageinfo.captionDate,
          this.config.photoCaptionDateFormat
        ),
      location: imageinfo.captionLocation || this.getExifLocation(image)
    };
  }

  private formatExifDate(
    rawDateTime: string | number | number[] | null,
    format: string
  ): string | undefined {
    if (rawDateTime === null || Array.isArray(rawDateTime)) {
      return undefined;
    }

    try {
      const dateMoment = this.moment(
        String(rawDateTime),
        'YYYY:MM:DD HH:mm:ss'
      );
      const formatted = dateMoment.format(format);
      return formatted === 'Invalid date' ? undefined : formatted;
    } catch {
      return undefined;
    }
  }

  private formatTimestampDate(
    timestamp: number | undefined,
    format: string
  ): string | undefined {
    if (!Number.isFinite(timestamp)) {
      return undefined;
    }

    try {
      const formatted = this.moment(String(timestamp), 'x').format(format);
      return formatted === 'Invalid date' ? undefined : formatted;
    } catch {
      return undefined;
    }
  }

  private getExifLocation(image: HTMLImageElement): string | undefined {
    const textLocation = this.getFirstExifStringTag(image, [
      'GPSAreaInformation',
      'Location',
      'City',
      'State',
      'Country'
    ]);
    if (textLocation) {
      return textLocation;
    }

    const latitude = this.getGpsCoordinate(
      this.EXIF.getTag(image, 'GPSLatitude'),
      this.EXIF.getTag(image, 'GPSLatitudeRef')
    );
    const longitude = this.getGpsCoordinate(
      this.EXIF.getTag(image, 'GPSLongitude'),
      this.EXIF.getTag(image, 'GPSLongitudeRef')
    );

    if (latitude === null || longitude === null) {
      return undefined;
    }

    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }

  private getFirstExifStringTag(
    image: HTMLImageElement,
    tags: string[]
  ): string | undefined {
    for (const tag of tags) {
      const value = this.EXIF.getTag(image, tag);
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return undefined;
  }

  private getGpsCoordinate(
    coordinate: string | number | number[] | null,
    ref: string | number | number[] | null
  ): number | null {
    if (!Array.isArray(coordinate) || coordinate.length < 3) {
      return null;
    }

    const degrees = Number(coordinate[0]);
    const minutes = Number(coordinate[1]);
    const seconds = Number(coordinate[2]);

    if (![degrees, minutes, seconds].every(Number.isFinite)) {
      return null;
    }

    let decimal = degrees + minutes / 60 + seconds / 3600;
    if (typeof ref === 'string' && ['S', 'W'].includes(ref.toUpperCase())) {
      decimal *= -1;
    }

    return decimal;
  }

  /**
   * Update to next/previous image
   */
  updateImage(
    backToPreviousImage = false,
    imageToDisplay: string | null = null
  ): void {
    if (imageToDisplay) {
      this.displayImage({
        identifier: this.identifier,
        path: imageToDisplay,
        data: imageToDisplay,
        index: 1,
        total: 1
      });
      return;
    }

    if (this.imageList.length > 0) {
      this.imageIndex += 1;

      if (this.config.randomizeImageOrder) {
        this.imageIndex = Math.floor(Math.random() * this.imageList.length);
      }

      const imageUrl = this.imageList.splice(this.imageIndex, 1);
      this.displayImage({
        identifier: this.identifier,
        path: imageUrl[0],
        data: imageUrl[0],
        index: 1,
        total: 1
      });
      return;
    }

    if (backToPreviousImage) {
      this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_PREV_IMAGE');
    } else {
      this.callbacks.sendSocketNotification('BACKGROUNDSLIDESHOW_NEXT_IMAGE');
    }
  }

  /**
   * Update image list with array of URLs
   */
  updateImageListWithArray(urls: string[]): void {
    this.imageList = urls.splice(0);
    this.imageIndex = 0;
    this.updateImage();
    if (!this.playingVideo && (this.timer || this.savedImages?.length === 0)) {
      // Restart timer only if timer was already running
      this.resume();
    }
  }

  /**
   * Update image info display
   */
  private updateImageInfo(imageinfo: ImageInfo, imageDate: string): void {
    if (this.imageInfoDiv && this.uiBuilder) {
      this.uiBuilder.updateImageInfo(
        this.imageInfoDiv,
        imageinfo,
        imageDate,
        this.callbacks.translate
      );
    }
  }

  /**
   * Suspend the slideshow timer
   */
  suspend(): void {
    this.Log.log('[MMM-SynInsta] Frontend suspend called');
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.config.displayMode === 'instax' && this.imagesDiv) {
      this.photoStackRenderer?.settleInFlightCards(this.imagesDiv);
    }
  }

  /**
   * Resume the slideshow timer
   */
  resume(): void {
    this.Log.log('[MMM-SynInsta] Frontend resume called');
    this.suspend();

    if (this.config.changeImageOnResume) {
      this.updateImage();
    }

    // Set timer for next image
    this.timer = setTimeout(() => {
      this.updateImage();
      if (!this.playingVideo) {
        this.resume();
      }
    }, this.config.slideshowSpeed);
  }

  /**
   * Request image list update from backend
   */
  updateImageList(): void {
    this.Log.log('[MMM-SynInsta] Frontend updateImageList called');
    this.suspend();
    this.Log.debug('[MMM-SynInsta] Getting images');
    this.callbacks.sendSocketNotification(
      'BACKGROUNDSLIDESHOW_REGISTER_CONFIG',
      this.config
    );
  }

  /**
   * Create gradient div
   */
  private createGradientDiv(
    direction: string,
    gradient: string[],
    wrapper: HTMLElement
  ): void {
    this.uiBuilder?.createGradientDiv(direction, gradient, wrapper);
  }

  /**
   * Create radial gradient div
   */
  private createRadialGradientDiv(
    type: string,
    gradient: string[],
    wrapper: HTMLElement
  ): void {
    this.uiBuilder?.createRadialGradientDiv(type, gradient, wrapper);
  }

  /**
   * Create image info div
   */
  private createImageInfoDiv(wrapper: HTMLElement): HTMLDivElement | null {
    return this.uiBuilder?.createImageInfoDiv(wrapper) || null;
  }

  /**
   * Create progress bar div
   */
  private createProgressbarDiv(
    wrapper: HTMLElement,
    slideshowSpeed: number
  ): void {
    this.uiBuilder?.createProgressbarDiv(wrapper, slideshowSpeed);
  }
}

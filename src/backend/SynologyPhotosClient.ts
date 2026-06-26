/**
 * SynologyPhotosClient.ts
 *
 * MagicMirror²
 * Module: MMM-SynInstax
 *
 * Synology Photos API client for fetching images
 * By Spydersoft Consulting
 * MIT Licensed.
 */

import axios from 'axios';
import Log from './Logger';
import type { ModuleConfig, PhotoItem } from '../types';

interface SynologyPhoto {
  id: number;
  type: string;
  filename?: string;
  mimetype?: string;
  time?: number;
  indexed_time?: number;
  additional?: {
    thumbnail?: {
      cache_key?: string;
    };
    address?: SynologyAddress | string;
    gps?: SynologyGps;
    exif?: Record<string, unknown>;
  };
}

interface SynologyAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  district?: string;
  county?: string;
  state?: string;
  country?: string;
  formatted?: string;
  display_name?: string;
}

interface SynologyGps {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
}

interface SynologyAlbum {
  id: number;
  name: string;
}

interface SynologyFolder {
  id: number;
  name: string;
}

interface SynologyTag {
  id: number;
  name: string;
}

interface TagIds {
  [key: string]: number[];
}

interface SourceRef {
  id: number;
  kind: 'album' | 'folder';
  spaceId: number | null;
}

class SynologyPhotosClient {
  private readonly baseUrl: string;

  private readonly account: string;

  private readonly password: string;

  private readonly albumName: string;

  private readonly shareToken: string;

  private readonly tagNames: string[];

  private sid: string | null = null;

  private sourceRefs: SourceRef[] = [];

  private tagIds: TagIds = {};

  private readonly useSharedAlbum: boolean;

  private readonly maxPhotosToFetch: number;

  private readonly authApiPath = '/webapi/auth.cgi';

  private readonly photosApiPath = '/webapi/entry.cgi';

  constructor(config: ModuleConfig) {
    this.baseUrl = config.synologyUrl;
    this.account = config.synologyAccount;
    this.password = config.synologyPassword;
    this.albumName = config.synologyAlbumName;
    this.shareToken = config.synologyShareToken;
    this.tagNames = config.synologyTagNames || [];
    this.useSharedAlbum = Boolean(this.shareToken);
    this.maxPhotosToFetch = config.synologyMaxPhotos || 1000;
  }

  /**
   * Authenticate with Synology and get session ID
   */
  async authenticate(): Promise<boolean> {
    if (this.useSharedAlbum) {
      Log.info('Using shared album token, skipping authentication');
      return true;
    }

    try {
      const response = await axios.get(`${this.baseUrl}${this.authApiPath}`, {
        params: {
          api: 'SYNO.API.Auth',
          version: '3',
          method: 'login',
          account: this.account,
          passwd: this.password,
          session: 'FileStation',
          format: 'sid'
        },
        timeout: 10000
      });

      if (response.data.success) {
        this.sid = response.data.data.sid;
        Log.info('Successfully authenticated with Synology');
        return true;
      }
      Log.error(
        `Synology authentication failed: ${JSON.stringify(response.data)}`
      );
      return false;
    } catch (error) {
      Log.error(`Synology authentication error: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * List albums to find the target album
   */
  async findAlbum(): Promise<boolean> {
    if (this.useSharedAlbum) {
      Log.info('Using shared album, skipping album search');
      return true;
    }

    try {
      this.sourceRefs = [];
      const personalAlbums = await this.listAlbums('SYNO.Foto.Browse.Album');
      const personalFolders = await this.listFolders('SYNO.Foto.Browse.Folder');
      const sharedFolders = await this.listFolders(
        'SYNO.FotoTeam.Browse.Folder',
        1
      );

      if (!this.albumName) {
        Log.info(
          `Found ${personalAlbums.length} personal albums, ${personalFolders.length} personal folders and ${sharedFolders.length} shared folders`
        );
        this.sourceRefs = [
          ...personalAlbums.map((album) => ({
            id: album.id,
            kind: 'album' as const,
            spaceId: null
          })),
          ...personalFolders.map((folder) => ({
            id: folder.id,
            kind: 'folder' as const,
            spaceId: 0
          })),
          ...sharedFolders.map((folder) => ({
            id: folder.id,
            kind: 'folder' as const,
            spaceId: 1
          }))
        ];
        return true;
      }

      const targetAlbum = personalAlbums.find((album) =>
        this.namesMatch(this.albumName, album.name)
      );
      if (targetAlbum) {
        Log.info(`Found personal album: ${targetAlbum.name}`);
        this.sourceRefs = [
          { id: targetAlbum.id, kind: 'album', spaceId: null }
        ];
        return true;
      }

      const targetPersonalFolder = personalFolders.find((folder) =>
        this.namesMatch(this.albumName, folder.name)
      );
      if (targetPersonalFolder) {
        Log.info(`Found personal folder: ${targetPersonalFolder.name}`);
        this.sourceRefs = [
          { id: targetPersonalFolder.id, kind: 'folder', spaceId: 0 }
        ];
        return true;
      }

      const targetSharedFolder = sharedFolders.find((folder) =>
        this.namesMatch(this.albumName, folder.name)
      );
      if (targetSharedFolder) {
        Log.info(`Found shared folder: ${targetSharedFolder.name}`);
        this.sourceRefs = [
          { id: targetSharedFolder.id, kind: 'folder', spaceId: 1 }
        ];
        return true;
      }

      Log.warn(
        `Album/folder "${this.albumName}" not found. Available albums/folders: ${[
          ...personalAlbums.map((a) => a.name),
          ...personalFolders.map((f) => f.name),
          ...sharedFolders.map((f) => f.name)
        ].join(', ')}`
      );
      return false;
    } catch (error) {
      Log.error(`Error listing albums/folders: ${(error as Error).message}`);
      return false;
    }
  }

  private async listAlbums(api: string): Promise<SynologyAlbum[]> {
    const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
      params: {
        api,
        version: '1',
        method: 'list',
        offset: 0,
        limit: 500,
        _sid: this.sid
      },
      timeout: 10000
    });

    if (!response.data.success) {
      Log.warn(`Failed to list albums via ${api}`);
      return [];
    }

    return response.data.data.list || [];
  }

  private async listFolders(
    api: string,
    spaceId: number | null = 0
  ): Promise<SynologyFolder[]> {
    const params: Record<string, unknown> = {
      api,
      version: '1',
      method: 'list',
      offset: 0,
      limit: 500,
      _sid: this.sid
    };

    if (spaceId === 1) {
      params.id = 1;
    }

    const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
      params,
      timeout: 10000
    });

    if (!response.data.success) {
      Log.warn(`Failed to list folders via ${api}`);
      return [];
    }

    return response.data.data.list || [];
  }

  private normalizeName(name: string): string {
    return name
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }

  private getLossyNameSkeleton(name: string): string {
    return this.normalizeName(name)
      .replace(/[^a-z0-9]/gu, '')
      .replace(/[aeiou]/gu, '');
  }

  private getNameVariants(name: string): Set<string> {
    const variants = new Set<string>();
    const add = (value: string): void => {
      variants.add(value);
      variants.add(this.normalizeName(value));
    };

    add(name);

    try {
      const mojibake = Buffer.from(name, 'utf8').toString('latin1');
      add(mojibake);
      add(Buffer.from(mojibake, 'latin1').toString('utf8'));
    } catch {
      // Ignore conversion failures and keep the original variants.
    }

    try {
      const repaired = Buffer.from(name, 'latin1').toString('utf8');
      add(repaired);
      add(Buffer.from(repaired, 'utf8').toString('latin1'));
    } catch {
      // Ignore conversion failures and keep the original variants.
    }

    return variants;
  }

  private namesMatch(configuredName: string, synologyName: string): boolean {
    const configuredVariants = this.getNameVariants(configuredName);
    const synologyVariants = this.getNameVariants(synologyName);

    for (const variant of configuredVariants) {
      if (synologyVariants.has(variant)) {
        return true;
      }
    }

    const configuredSkeleton = this.getLossyNameSkeleton(configuredName);
    const synologySkeleton = this.getLossyNameSkeleton(synologyName);
    if (
      configuredSkeleton.length >= 3 &&
      configuredSkeleton === synologySkeleton
    ) {
      return true;
    }

    return false;
  }

  /**
   * Filter tags by name
   */
  private filterMatchingTags(allTags: SynologyTag[]): SynologyTag[] {
    return allTags.filter((tag) =>
      this.tagNames.some((tagName) => this.namesMatch(tagName, tag.name))
    );
  }

  /**
   * Find tags in shared album
   */
  private async findTagsInSharedAlbum(): Promise<boolean> {
    const params = {
      api: 'SYNO.Foto.Browse.GeneralTag',
      version: '1',
      method: 'list',
      offset: 0,
      limit: 500,
      passphrase: this.shareToken
    };

    Log.info('Fetching tags from shared album');

    const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
      params,
      timeout: 10000
    });

    if (!response.data.success) {
      Log.error(`Failed to list tags: ${JSON.stringify(response.data)}`);
      return false;
    }

    const matchedTags = this.filterMatchingTags(response.data.data.list);

    if (matchedTags.length === 0) {
      Log.warn(`No matching tags found for: ${this.tagNames.join(', ')}`);
      return false;
    }

    this.tagIds.shared = matchedTags.map((tag) => tag.id);
    Log.info(
      `Found ${matchedTags.length} matching tags in shared album: ${matchedTags.map((t) => t.name).join(', ')}`
    );
    return true;
  }

  /**
   * Find tags in a specific space
   */
  private async findTagsInSpace(space: {
    id: number;
    name: string;
    api: string;
  }): Promise<boolean> {
    const params: Record<string, unknown> = {
      api: space.api,
      version: '1',
      method: 'list',
      offset: 0,
      limit: 500,
      _sid: this.sid
    };

    if (space.id === 0) {
      params.space_id = 0;
    }

    const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
      params,
      timeout: 10000
    });

    if (!response.data.success) {
      Log.warn(`Failed to list tags in ${space.name} space`);
      return false;
    }

    const matchedTags = this.filterMatchingTags(response.data.data.list);

    if (matchedTags.length === 0) {
      return false;
    }

    this.tagIds[space.id] = matchedTags.map((tag) => tag.id);
    const tagDescriptions = matchedTags
      .map((t) => `${t.name}(${t.id})`)
      .join(', ');
    Log.info(
      `Found ${matchedTags.length} tag(s) in ${space.name} space: ${tagDescriptions}`
    );
    return true;
  }

  /**
   * Find tags across personal and shared spaces
   */
  private async findTagsInMultipleSpaces(): Promise<boolean> {
    const spaces = [
      { id: 0, name: 'personal', api: 'SYNO.Foto.Browse.GeneralTag' },
      { id: 1, name: 'shared', api: 'SYNO.FotoTeam.Browse.GeneralTag' }
    ];

    let foundAnyTags = false;

    for (const space of spaces) {
      try {
        const found = await this.findTagsInSpace(space);
        if (found) {
          foundAnyTags = true;
        }
      } catch (error) {
        Log.warn(
          `Error fetching tags from ${space.name} space: ${(error as Error).message}`
        );
      }
    }

    if (!foundAnyTags) {
      Log.warn(`No matching tags found for: ${this.tagNames.join(', ')}`);
      return false;
    }

    return true;
  }

  /**
   * Find tags by name across personal and shared spaces
   */
  async findTags(): Promise<boolean> {
    if (!this.tagNames || this.tagNames.length === 0) {
      return true;
    }

    try {
      this.tagIds = {};

      if (this.useSharedAlbum) {
        return await this.findTagsInSharedAlbum();
      }

      return await this.findTagsInMultipleSpaces();
    } catch (error) {
      Log.error(`Error listing tags: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Fetch photos by tags across spaces
   */
  private async fetchPhotosByTags(): Promise<PhotoItem[]> {
    const fetchPromises: Promise<PhotoItem[]>[] = [];

    Log.info(
      `Fetching photos for tags across spaces: ${JSON.stringify(this.tagIds)}`
    );

    for (const [spaceKey, tagIdArray] of Object.entries(this.tagIds)) {
      const spaceId = spaceKey === 'shared' ? 1 : Number.parseInt(spaceKey, 10);
      Log.info(
        `Processing space ${spaceKey} (ID: ${spaceId}) with ${tagIdArray.length} tag(s)`
      );

      for (const tagId of tagIdArray) {
        fetchPromises.push(this.fetchPhotosByTagInSpace(tagId, spaceId));
      }
    }

    Log.info(`Created ${fetchPromises.length} fetch promises`);
    const photoArrays = await Promise.all(fetchPromises);
    Log.info(
      `Received ${photoArrays.length} photo arrays: ${photoArrays.map((arr) => arr.length).join(', ')} photos each`
    );

    const photos = photoArrays.flat();
    Log.info(`Total photos before deduplication: ${photos.length}`);

    const deduplicated = this.removeDuplicatePhotos(photos);
    Log.info(`Total photos after deduplication: ${deduplicated.length}`);

    return deduplicated;
  }

  /**
   * Fetch photos from albums
   */
  private async fetchPhotosFromAlbums(): Promise<PhotoItem[]> {
    if (this.sourceRefs.length === 0) {
      return await this.fetchAllPhotos();
    }

    const sourcePromises = this.sourceRefs.map((source) =>
      this.fetchSourceItems(source)
    );
    const photoArrays = await Promise.all(sourcePromises);
    return photoArrays.flat();
  }

  /**
   * Fetch photos from Synology Photos
   */
  async fetchPhotos(): Promise<PhotoItem[]> {
    try {
      let photos: PhotoItem[] = [];

      if (this.tagIds && Object.keys(this.tagIds).length > 0) {
        photos = await this.fetchPhotosByTags();
      } else if (this.useSharedAlbum) {
        photos = await this.fetchSharedAlbumPhotos();
      } else {
        photos = await this.fetchPhotosFromAlbums();
      }

      Log.info(`Fetched ${photos.length} photos from Synology Photos`);
      return photos;
    } catch (error) {
      Log.error(`Error fetching photos: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Fetch photos from a shared album using token
   */
  private async fetchSharedAlbumPhotos(): Promise<PhotoItem[]> {
    try {
      const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
        params: {
          api: 'SYNO.Foto.Browse.Item',
          version: '1',
          method: 'list',
          offset: 0,
          limit: this.maxPhotosToFetch,
          passphrase: this.shareToken,
          additional:
            '["thumbnail","resolution","orientation","video_convert","video_meta","provider_user_id","gps","address","exif"]'
        },
        timeout: 30000
      });

      if (response.data.success) {
        return this.processPhotoList(response.data.data.list);
      }
      Log.error(
        `Failed to fetch shared album photos: ${JSON.stringify(response.data)}`
      );
      return [];
    } catch (error) {
      Log.error(
        `Error fetching shared album photos: ${(error as Error).message}`
      );
      return [];
    }
  }

  /**
   * Fetch all photos from Synology Photos
   */
  private async fetchAllPhotos(): Promise<PhotoItem[]> {
    try {
      const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
        params: {
          api: 'SYNO.Foto.Browse.Item',
          version: '1',
          method: 'list',
          offset: 0,
          limit: this.maxPhotosToFetch,
          _sid: this.sid,
          additional:
            '["thumbnail","resolution","orientation","video_convert","video_meta","provider_user_id","gps","address","exif"]'
        },
        timeout: 30000
      });

      if (response.data.success) {
        return this.processPhotoList(response.data.data.list);
      }
      Log.error(`Failed to fetch all photos: ${JSON.stringify(response.data)}`);
      return [];
    } catch (error) {
      Log.error(`Error fetching all photos: ${(error as Error).message}`);
      return [];
    }
  }

  private getItemApi(spaceId: number | null): string {
    return spaceId === 1
      ? 'SYNO.FotoTeam.Browse.Item'
      : 'SYNO.Foto.Browse.Item';
  }

  private getDownloadApi(spaceId: number | null): string {
    return spaceId === 1 ? 'SYNO.FotoTeam.Download' : 'SYNO.Foto.Download';
  }

  /**
   * Fetch media from a specific album or folder source
   */
  private async fetchSourceItems(source: SourceRef): Promise<PhotoItem[]> {
    try {
      const params: Record<string, unknown> = {
        api: this.getItemApi(source.spaceId),
        version: '1',
        method: 'list',
        offset: 0,
        limit: this.maxPhotosToFetch,
        _sid: this.sid,
        additional:
          '["thumbnail","resolution","orientation","video_convert","video_meta","provider_user_id","gps","address","exif"]'
      };

      if (source.kind === 'album') {
        params.album_id = source.id;
      } else {
        params.folder_id = source.id;
      }

      const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
        params,
        timeout: 30000
      });

      if (response.data.success) {
        return this.processPhotoList(response.data.data.list, source.spaceId);
      }
      Log.error(
        `Failed to fetch ${source.kind} media: ${JSON.stringify(response.data)}`
      );
      return [];
    } catch (error) {
      Log.error(`Error fetching source media: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Fetch photos by tag from a specific space
   */
  private async fetchPhotosByTagInSpace(
    tagId: number,
    spaceId: number | null
  ): Promise<PhotoItem[]> {
    try {
      const params: Record<string, unknown> = {
        api: this.getItemApi(spaceId),
        version: '1',
        method: 'list',
        offset: 0,
        limit: this.maxPhotosToFetch,
        general_tag_id: tagId,
        additional:
          '["thumbnail","resolution","orientation","video_convert","video_meta","provider_user_id","gps","address","exif"]'
      };

      if (this.useSharedAlbum) {
        params.passphrase = this.shareToken;
      } else {
        params._sid = this.sid;
        if (spaceId === 0) {
          params.space_id = spaceId;
        }
      }

      Log.info(
        `Fetching photos for tag ${tagId} in space ${spaceId} with API: ${params.api}`
      );

      const response = await axios.get(`${this.baseUrl}${this.photosApiPath}`, {
        params,
        timeout: 30000
      });

      if (response.data.success) {
        const rawPhotos: SynologyPhoto[] = response.data.data.list;
        Log.info(
          `API returned ${rawPhotos.length} photos for tag ${tagId} in space ${spaceId}`
        );
        return this.processPhotoList(rawPhotos, spaceId);
      }
      Log.warn(
        `API call failed for tag ${tagId} in space ${spaceId}: ${JSON.stringify(response.data)}`
      );
      return [];
    } catch (error) {
      Log.error(
        `Error fetching photos by tag ${tagId} from space ${spaceId}: ${(error as Error).message}`
      );
      return [];
    }
  }

  /**
   * Remove duplicate photos from array using synologyId
   */
  private removeDuplicatePhotos(photos: PhotoItem[]): PhotoItem[] {
    const seen = new Set<string | number>();
    return photos.filter((photo) => {
      const dedupeKey =
        (photo as PhotoItem & { synologyId?: number; id?: number })
          .synologyId || (photo as PhotoItem & { id?: number }).id;
      if (seen.has(dedupeKey!)) {
        return false;
      }
      seen.add(dedupeKey!);
      return true;
    });
  }

  /**
   * Process photo list and extract relevant information
   */
  private processPhotoList(
    photos: SynologyPhoto[],
    spaceId: number | null = null
  ): PhotoItem[] {
    const imageList: PhotoItem[] = [];

    for (const photo of photos) {
      if (
        photo.type !== 'photo' &&
        photo.type !== 'live_photo' &&
        photo.type !== 'live' &&
        photo.type !== 'video'
      ) {
        continue;
      }

      const imageUrl = this.getPhotoUrl(
        photo.id,
        photo.additional?.thumbnail?.cache_key,
        spaceId
      );
      const mediaType = this.getMediaType(photo);
      const mimeType = photo.mimetype || this.getMimeType(photo);
      const mediaUrl =
        mediaType === 'video' || mimeType === 'image/gif'
          ? this.getOriginalMediaUrl(
              photo.id,
              photo.additional?.thumbnail?.cache_key,
              spaceId
            )
          : imageUrl;
      const uniqueId = spaceId === null ? photo.id : `${spaceId}_${photo.id}`;
      const captionDate = photo.time ? photo.time * 1000 : undefined;
      const captionLocation = this.formatPhotoLocation(photo);

      imageList.push({
        path: photo.filename || `photo_${photo.id}`,
        url: imageUrl,
        mediaUrl,
        mediaType,
        mimeType,
        captionDate,
        captionLocation,
        created: photo.time ? photo.time * 1000 : Date.now(),
        modified: photo.indexed_time ? photo.indexed_time * 1000 : Date.now(),
        id: uniqueId,
        synologyId: photo.id,
        spaceId,
        isSynology: true
      } as PhotoItem & {
        id: number | string;
        synologyId: number;
        spaceId: number | null;
        isSynology: boolean;
      });
    }

    return imageList;
  }

  private getMediaType(photo: SynologyPhoto): 'image' | 'video' | 'live' {
    if (photo.type === 'video') {
      return 'video';
    }
    if (photo.type === 'live_photo' || photo.type === 'live') {
      return 'live';
    }
    return 'image';
  }

  private getMimeType(photo: SynologyPhoto): string {
    const filename = photo.filename || '';
    const ext = filename.split('.').pop()?.toLowerCase();
    if (
      photo.type === 'video' ||
      ['mp4', 'm4v', 'mov', 'webm'].includes(ext || '')
    ) {
      return ext === 'webm' ? 'video/webm' : 'video/mp4';
    }
    if (ext === 'gif') {
      return 'image/gif';
    }
    if (ext === 'png') {
      return 'image/png';
    }
    return 'image/jpeg';
  }

  private formatPhotoLocation(photo: SynologyPhoto): string | undefined {
    const address = photo.additional?.address;
    if (address && typeof address === 'object') {
      const city =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.district;

      if (city) {
        return city;
      }

      if (address.country) {
        return address.country;
      }
    }

    const gps = photo.additional?.gps;
    const latitude = gps?.latitude ?? gps?.lat;
    const longitude = gps?.longitude ?? gps?.lng;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    }

    return undefined;
  }

  /**
   * Generate photo URL for downloading
   */
  private getPhotoUrl(
    photoId: number,
    cacheKey: string | undefined,
    spaceId: number | null = null
  ): string {
    let url: string;
    const quotedCacheKey = `"${cacheKey}"`;

    if (this.useSharedAlbum) {
      url = `${this.baseUrl}${this.photosApiPath}?api=SYNO.Foto.Thumbnail&version=2&method=get&id=${photoId}&cache_key=${quotedCacheKey}&type="unit"&size="xl"&passphrase=${this.shareToken}`;
    } else {
      const api =
        spaceId === 1 ? 'SYNO.FotoTeam.Thumbnail' : 'SYNO.Foto.Thumbnail';
      url = `${this.baseUrl}${this.photosApiPath}?api=${api}&version=2&method=get&id=${photoId}&cache_key=${quotedCacheKey}&type="unit"&size="xl"&_sid=${this.sid}`;

      if (spaceId === 0) {
        url += `&space_id=${spaceId}`;
      }
    }

    return url;
  }

  private getOriginalMediaUrl(
    photoId: number,
    cacheKey: string | undefined,
    spaceId: number | null = null
  ): string {
    const api = this.getDownloadApi(spaceId);
    const quotedCacheKey = `"${cacheKey}"`;
    const unitId = `[${photoId}]`;
    let url = `${this.baseUrl}${this.photosApiPath}?api=${api}&version=1&method=download&unit_id=${unitId}&cache_key=${quotedCacheKey}`;

    if (this.useSharedAlbum) {
      url += `&passphrase=${this.shareToken}`;
    } else {
      url += `&_sid=${this.sid}`;
    }

    return url;
  }

  /**
   * Download photo from Synology
   */
  async downloadPhoto(photoUrl: string): Promise<Buffer | null> {
    try {
      const response = await axios.get(photoUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      return Buffer.from(response.data, 'binary');
    } catch (error) {
      Log.error(`Error downloading photo: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Logout and end session
   */
  async logout(): Promise<void> {
    if (this.useSharedAlbum || !this.sid) {
      return;
    }

    try {
      await axios.get(`${this.baseUrl}${this.authApiPath}`, {
        params: {
          api: 'SYNO.API.Auth',
          version: '3',
          method: 'logout',
          session: 'FileStation',
          _sid: this.sid
        },
        timeout: 5000
      });
      Log.info('Logged out from Synology');
    } catch (error) {
      Log.error(`Error logging out: ${(error as Error).message}`);
    }
  }
}

export default SynologyPhotosClient;

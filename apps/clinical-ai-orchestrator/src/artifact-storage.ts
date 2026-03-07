import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function contentTypeToExtension(contentType: string): string {
  const normalized = contentType.toLowerCase();

  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mpeg')) return 'mp3';
  if (normalized.includes('wav') || normalized.includes('wave')) return 'wav';
  if (normalized.includes('mp4')) return 'm4a';
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('aac')) return 'aac';

  return 'bin';
}

function toFileUri(filePath: string): string {
  return pathToFileURL(filePath).toString();
}

export class LocalArtifactStorage {
  constructor(private readonly rootDir: string) {}

  async ensureReady(): Promise<void> {
    await Promise.all([
      mkdir(this.rootDir, { recursive: true }),
      mkdir(path.join(this.rootDir, 'raw'), { recursive: true }),
      mkdir(path.join(this.rootDir, 'normalized'), { recursive: true }),
      mkdir(path.join(this.rootDir, 'processing'), { recursive: true }),
      mkdir(path.join(this.rootDir, 'transcripts'), { recursive: true }),
    ]);
  }

  async writeRawMedia(args: {
    mediaItemId: string;
    contentType: string;
    bytes: Buffer;
  }): Promise<{ filePath: string; storageUri: string; extension: string }> {
    const extension = contentTypeToExtension(args.contentType);
    const filePath = path.join(this.rootDir, 'raw', `${args.mediaItemId}.${extension}`);
    await writeFile(filePath, args.bytes);

    return {
      filePath,
      storageUri: toFileUri(filePath),
      extension,
    };
  }

  async prepareNormalizedTarget(mediaItemId: string): Promise<{ filePath: string; storageUri: string }> {
    const filePath = path.join(this.rootDir, 'normalized', `${mediaItemId}.wav`);
    await mkdir(path.dirname(filePath), { recursive: true });

    return {
      filePath,
      storageUri: toFileUri(filePath),
    };
  }

  async prepareProcessingTarget(args: {
    sessionId: string;
    fileName: string;
  }): Promise<{ filePath: string; storageUri: string }> {
    const sessionDir = path.join(this.rootDir, 'processing', args.sessionId);
    await mkdir(sessionDir, { recursive: true });
    const filePath = path.join(sessionDir, args.fileName);

    return {
      filePath,
      storageUri: toFileUri(filePath),
    };
  }

  async writeTranscriptArtifact(args: {
    sessionId: string;
    fileName: string;
    payload: unknown;
  }): Promise<{ filePath: string; storageUri: string }> {
    const sessionDir = path.join(this.rootDir, 'transcripts', args.sessionId);
    await mkdir(sessionDir, { recursive: true });
    const filePath = path.join(sessionDir, args.fileName);
    await writeFile(filePath, JSON.stringify(args.payload, null, 2), 'utf8');

    return {
      filePath,
      storageUri: toFileUri(filePath),
    };
  }

  resolvePath(storageUri: string): string {
    if (storageUri.startsWith('file://')) {
      return fileURLToPath(storageUri);
    }

    if (path.isAbsolute(storageUri)) {
      return storageUri;
    }

    return path.resolve(this.rootDir, storageUri);
  }
}

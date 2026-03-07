import { copyFile, stat, writeFile, rm } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export interface AudioProbeResult {
  durationSeconds?: number;
  sizeBytes: number;
}

export async function probeAudio(filePath: string, ffprobeBinary: string): Promise<AudioProbeResult> {
  const fileStat = await stat(filePath);
  const { stdout } = await execFile(ffprobeBinary, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    filePath,
  ]);

  const parsed = JSON.parse(stdout) as {
    format?: {
      duration?: string;
    };
  };
  const duration = parsed.format?.duration ? Number.parseFloat(parsed.format.duration) : undefined;

  return {
    sizeBytes: fileStat.size,
    ...(duration && Number.isFinite(duration) ? { durationSeconds: Math.max(0, Math.round(duration)) } : {}),
  };
}

export async function normalizeAudio(args: {
  inputPath: string;
  outputPath: string;
  ffmpegBinary: string;
}): Promise<void> {
  await execFile(args.ffmpegBinary, [
    '-y',
    '-i',
    args.inputPath,
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'pcm_s16le',
    args.outputPath,
  ]);
}

export async function concatenateNormalizedAudio(args: {
  inputPaths: string[];
  outputPath: string;
  ffmpegBinary: string;
}): Promise<void> {
  if (args.inputPaths.length === 0) {
    throw new Error('At least one normalized audio input is required');
  }

  if (args.inputPaths.length === 1) {
    const [onlyInputPath] = args.inputPaths;
    if (!onlyInputPath) {
      throw new Error('Normalized audio input is missing');
    }

    await copyFile(onlyInputPath, args.outputPath);
    return;
  }

  const listPath = path.join(path.dirname(args.outputPath), `${path.basename(args.outputPath)}.concat.txt`);
  const listContents = args.inputPaths.map((filePath) => `file '${filePath.replace(/'/g, "'\\''")}'`).join('\n');
  await writeFile(listPath, listContents, 'utf8');

  try {
    await execFile(args.ffmpegBinary, [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'pcm_s16le',
      args.outputPath,
    ]);
  } finally {
    await rm(listPath, { force: true });
  }
}

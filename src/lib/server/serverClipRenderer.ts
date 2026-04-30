import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

type ClipFile = {
  file: File;
  ext: string;
};

export type ServerRenderInput = {
  videoClips: ClipFile[];
  audioClips: ClipFile[];
};

export type ServerRenderResult = {
  bytes: Buffer;
  durationSeconds: number;
  filename: string;
};

const WORK_DIR = path.join(process.cwd(), '.local-review-data', 'server-renders');
const VIDEO_WIDTH = 540;
const VIDEO_HEIGHT = 960;
const VIDEO_FPS = 24;
const MAX_VIDEO_CLIP_SECONDS = 6;
const MAX_AUDIO_CLIP_SECONDS = 12;

function safeExt(ext: string) {
  const normalized = ext.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === 'mp4' || normalized === 'mov' || normalized === 'webm') return normalized;
  if (normalized === 'm4a' || normalized === 'mp3' || normalized === 'wav') return normalized;
  return 'webm';
}

async function runCommand(command: string, args: string[], label: string) {
  return await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const logs: string[] = [];
    const collect = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) logs.push(trimmed);
      }
      if (logs.length > 80) logs.splice(0, logs.length - 80);
    };

    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (err) => {
      reject(new Error(`${label} failed to start: ${err.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          logs.length
            ? `${label} failed with exit code ${code}: ${logs.slice(-10).join(' | ')}`
            : `${label} failed with exit code ${code}`,
        ),
      );
    });
  });
}

async function writeClip(file: File, filePath: string) {
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length <= 0) throw new Error('One of the clips was empty.');
  await writeFile(filePath, bytes);
}

async function probeDuration(filePath: string) {
  try {
    const args = [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ];
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn('ffprobe', args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`ffprobe exited with ${code}`));
      });
    });
    const duration = Number(output);
    return Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0;
  } catch {
    return 0;
  }
}

export async function renderClipsOnServer(input: ServerRenderInput): Promise<ServerRenderResult> {
  if (input.videoClips.length === 0) {
    throw new Error('No video clips were uploaded.');
  }

  const runId = Math.random().toString(36).slice(2, 10);
  const runDir = path.join(WORK_DIR, runId);
  await mkdir(runDir, { recursive: true });

  const videoPaths: string[] = [];
  const audioPaths: string[] = [];
  const outputPath = path.join(runDir, `matcha-server-${runId}.webm`);

  try {
    for (let i = 0; i < input.videoClips.length; i++) {
      const clip = input.videoClips[i]!;
      const filePath = path.join(runDir, `video-${i}.${safeExt(clip.ext)}`);
      await writeClip(clip.file, filePath);
      videoPaths.push(filePath);
    }

    for (let i = 0; i < input.audioClips.length; i++) {
      const clip = input.audioClips[i]!;
      const filePath = path.join(runDir, `audio-${i}.${safeExt(clip.ext)}`);
      await writeClip(clip.file, filePath);
      audioPaths.push(filePath);
    }

    const inputArgs = [
      ...videoPaths.flatMap((filePath) => [
        '-t',
        String(MAX_VIDEO_CLIP_SECONDS),
        '-i',
        filePath,
      ]),
      ...audioPaths.flatMap((filePath) => [
        '-t',
        String(MAX_AUDIO_CLIP_SECONDS),
        '-i',
        filePath,
      ]),
    ];

    const videoFilters = videoPaths
      .map((_, i) => {
        return (
          `[${i}:v]trim=duration=${MAX_VIDEO_CLIP_SECONDS},setpts=PTS-STARTPTS,` +
          `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,` +
          `pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2,` +
          `setsar=1,fps=${VIDEO_FPS},format=yuv420p[v${i}]`
        );
      })
      .join(';');
    const videoInputs = videoPaths.map((_, i) => `[v${i}]`).join('');
    const videoConcat = `${videoInputs}concat=n=${videoPaths.length}:v=1:a=0[v]`;

    const audioOffset = videoPaths.length;
    const audioFilters = audioPaths
      .map((_, i) => {
        return (
          `[${audioOffset + i}:a]atrim=duration=${MAX_AUDIO_CLIP_SECONDS},` +
          `aresample=48000,asetpts=PTS-STARTPTS[a${i}]`
        );
      })
      .join(';');
    const audioInputs = audioPaths.map((_, i) => `[a${i}]`).join('');
    const audioConcat = audioPaths.length
      ? `${audioInputs}concat=n=${audioPaths.length}:v=0:a=1[a]`
      : '';

    const filterComplex = [videoFilters, videoConcat, audioFilters, audioConcat]
      .filter(Boolean)
      .join(';');

    const outputArgs = audioPaths.length
      ? ['-map', '[v]', '-map', '[a]']
      : ['-map', '[v]'];

    await runCommand(
      'ffmpeg',
      [
        '-y',
        ...inputArgs,
        '-filter_complex',
        filterComplex,
        ...outputArgs,
        '-c:v',
        'libvpx',
        '-b:v',
        '1.1M',
        '-deadline',
        'realtime',
        '-cpu-used',
        '6',
        ...(audioPaths.length ? ['-c:a', 'libopus', '-b:a', '96k'] : ['-an']),
        '-avoid_negative_ts',
        'make_zero',
        outputPath,
      ],
      'Server clip render',
    );

    const bytes = await readFile(outputPath);
    if (bytes.length <= 0) throw new Error('Server render produced an empty video.');

    return {
      bytes,
      durationSeconds: await probeDuration(outputPath),
      filename: `matcha-server-${runId}.webm`,
    };
  } finally {
    await rm(runDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

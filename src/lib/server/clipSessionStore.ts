import { mkdir, readdir, rm, stat, writeFile } from 'fs/promises';
import path from 'path';

export type StoredClip = {
  step: number;
  takeId: number;
  mediaType: 'video' | 'audio';
  ext: 'webm' | 'mp4' | 'mov';
  filePath: string;
  size: number;
};

type ParsedClipFile = {
  step: number;
  takeId: number;
  mediaType: 'video' | 'audio';
  ext: StoredClip['ext'];
};

const SESSION_ROOT = path.join(process.cwd(), '.local-review-data', 'clip-sessions');
const MAX_CLIP_BYTES = 120 * 1024 * 1024;

function safeSessionId(sessionId: string) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(sessionId)) return null;
  return sessionId;
}

function safeExt(ext: string): StoredClip['ext'] {
  const normalized = ext.toLowerCase();
  if (normalized === 'mp4' || normalized === 'mov' || normalized === 'webm') return normalized;
  return 'webm';
}

function sessionDir(sessionId: string) {
  const safe = safeSessionId(sessionId);
  if (!safe) return null;

  const absolute = path.resolve(SESSION_ROOT, safe);
  const root = path.resolve(SESSION_ROOT);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) return null;
  return absolute;
}

function safeTakeId(takeId: number) {
  return Number.isSafeInteger(takeId) && takeId >= 0 ? takeId : 0;
}

function parseClipFileName(name: string): ParsedClipFile | null {
  const withTake = /^(\d+)-(video|audio)-(\d+)\.(webm|mp4|mov)$/.exec(name);
  if (withTake) {
    return {
      step: Number(withTake[1]),
      mediaType: withTake[2] as ParsedClipFile['mediaType'],
      takeId: Number(withTake[3]),
      ext: withTake[4] as StoredClip['ext'],
    };
  }

  const legacy = /^(\d+)-(video|audio)\.(webm|mp4|mov)$/.exec(name);
  if (legacy) {
    return {
      step: Number(legacy[1]),
      mediaType: legacy[2] as ParsedClipFile['mediaType'],
      takeId: 0,
      ext: legacy[3] as StoredClip['ext'],
    };
  }

  return null;
}

async function removeOlderTakes(dir: string, input: { step: number; mediaType: 'video' | 'audio'; takeId: number }) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile()) return;
      const parsed = parseClipFileName(entry.name);
      if (!parsed) return;
      if (
        parsed.step === input.step &&
        parsed.mediaType === input.mediaType &&
        parsed.takeId < input.takeId
      ) {
        await rm(path.join(dir, entry.name), { force: true }).catch(() => undefined);
      }
    }),
  );
}

export async function saveSessionClip(input: {
  sessionId: string;
  step: number;
  takeId: number;
  mediaType: 'video' | 'audio';
  ext: string;
  file: File;
}) {
  const dir = sessionDir(input.sessionId);
  if (!dir) throw new Error('Invalid upload session.');
  if (!Number.isInteger(input.step) || input.step < 1 || input.step > 20) {
    throw new Error('Invalid clip step.');
  }
  if (input.file.size <= 0) throw new Error('Clip was empty.');
  if (input.file.size > MAX_CLIP_BYTES) {
    throw new Error('Clip is too large. Please record shorter shots.');
  }

  const ext = safeExt(input.ext);
  const takeId = safeTakeId(input.takeId);
  await mkdir(dir, { recursive: true });

  const filePath = path.join(dir, `${input.step}-${input.mediaType}-${takeId}.${ext}`);
  const bytes = Buffer.from(await input.file.arrayBuffer());
  await writeFile(filePath, bytes);
  await removeOlderTakes(dir, {
    step: input.step,
    mediaType: input.mediaType,
    takeId,
  });

  return {
    sessionId: input.sessionId,
    step: input.step,
    takeId,
    mediaType: input.mediaType,
    ext,
    size: bytes.length,
  };
}

export async function listSessionClips(sessionId: string) {
  const dir = sessionDir(sessionId);
  if (!dir) throw new Error('Invalid upload session.');

  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const clipsBySlot = new Map<string, StoredClip & { mtimeMs: number }>();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parsed = parseClipFileName(entry.name);
    if (!parsed) continue;

    const filePath = path.join(dir, entry.name);
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat) continue;

    const slotKey = `${parsed.step}:${parsed.mediaType}`;
    const existing = clipsBySlot.get(slotKey);
    if (
      existing &&
      (existing.takeId > parsed.takeId ||
        (existing.takeId === parsed.takeId && existing.mtimeMs >= fileStat.mtimeMs))
    ) {
      continue;
    }

    clipsBySlot.set(slotKey, {
      step: parsed.step,
      takeId: parsed.takeId,
      mediaType: parsed.mediaType,
      ext: parsed.ext,
      filePath,
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs,
    });
  }

  return Array.from(clipsBySlot.values())
    .map(({ mtimeMs: _mtimeMs, ...clip }) => clip)
    .sort((a, b) => a.step - b.step);
}

export async function cleanupSessionClips(sessionId: string) {
  const dir = sessionDir(sessionId);
  if (!dir) return;
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

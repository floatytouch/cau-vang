import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeFileAtomic(targetPath: string, contents: string): Promise<void> {
  const directory = path.dirname(targetPath);
  await fs.mkdir(directory, { recursive: true });
  const tempPath = path.join(
    directory,
    `${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}`,
  );
  const handle = await fs.open(tempPath, 'w');
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tempPath, targetPath);
}

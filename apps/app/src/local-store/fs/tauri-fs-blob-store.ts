import {
  BaseDirectory,
  exists,
  mkdir,
  readFile,
  remove,
  rename,
  writeFile,
} from '@tauri-apps/plugin-fs'
import type { BinaryBlobStore } from '@/local-store/contracts'

const imagesRoot = 'images'
const baseDir = { baseDir: BaseDirectory.AppData } as const

function pathFor(key: string): string {
  return `${imagesRoot}/${key}`
}

function parentDirOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'))
}

export class TauriFsBlobStore implements BinaryBlobStore {
  async read(key: string): Promise<Uint8Array | null> {
    const path = pathFor(key)

    if (!(await exists(path, baseDir))) {
      return null
    }

    return readFile(path, baseDir)
  }

  async write(key: string, bytes: Uint8Array): Promise<void> {
    const path = pathFor(key)
    await mkdir(parentDirOf(path), { ...baseDir, recursive: true })
    await writeFile(path, bytes, baseDir)
  }

  async remove(key: string): Promise<void> {
    const path = pathFor(key)

    if (!(await exists(path, baseDir))) {
      return
    }

    await remove(path, baseDir)
  }

  async move(sourceKey: string, destinationKey: string): Promise<void> {
    const sourcePath = pathFor(sourceKey)

    if (!(await exists(sourcePath, baseDir))) {
      return
    }

    const destinationPath = pathFor(destinationKey)
    await mkdir(parentDirOf(destinationPath), { ...baseDir, recursive: true })
    await rename(sourcePath, destinationPath, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    })
  }
}

export function createTauriFsBlobStore(): TauriFsBlobStore {
  return new TauriFsBlobStore()
}

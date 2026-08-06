import { createAutomationEventBus } from '@/automation'
import { createCryptoService, createKeyring } from '@/crypto'
import { createImageProcessor } from '@/images'
import { createLocalStores, type LocalStoreRuntime } from '@/local-store'
import {
  DefaultImageRepository,
  type DefaultImageRepositoryDependencies,
} from '@/repository/image-repository'
import {
  DefaultNoteRepository,
  type DefaultNoteRepositoryDependencies,
} from '@/repository/note-repository'
import { userIdSchema, type DeviceId, type UserId } from '@/shared/contracts'

export type CreateNoteRepositoryOptions = {
  runtime: LocalStoreRuntime
  userId: UserId | string
  deviceId: DeviceId | string
  databaseName?: string
  clock?: DefaultNoteRepositoryDependencies['clock']
  idFactory?: DefaultNoteRepositoryDependencies['idFactory']
  imageProcessor?: DefaultImageRepositoryDependencies['imageProcessor']
}

export type Repositories = {
  noteRepository: DefaultNoteRepository
  imageRepository: DefaultImageRepository
}

// Notes and images share one keyring (so a cached master key unlocks both)
// and one local-store connection.
export async function createRepositories(
  options: CreateNoteRepositoryOptions,
): Promise<Repositories> {
  const { notesStore, imagesStore } = await createLocalStores({
    runtime: options.runtime,
    databaseName: options.databaseName,
  })
  const parsedUserId = userIdSchema.parse(options.userId)
  const automationEvents = createAutomationEventBus({
    localStore: notesStore,
    userId: parsedUserId,
    clock: options.clock,
  })
  const cryptoService = createCryptoService()
  const keyring = createKeyring(cryptoService)

  const noteRepository = new DefaultNoteRepository({
    automationEvents,
    cryptoService,
    keyring,
    localStore: notesStore,
    userId: parsedUserId,
    deviceId: options.deviceId,
    clock: options.clock,
    idFactory: options.idFactory,
  })

  const imageRepository = new DefaultImageRepository({
    localImagesStore: imagesStore,
    imageProcessor: options.imageProcessor ?? createImageProcessor(),
    localNotesStore: notesStore,
    cryptoService,
    keyring,
    userId: parsedUserId,
    deviceId: options.deviceId,
    clock: options.clock,
  })

  // Finish or roll back crash-interrupted image operations before any UI can
  // observe the repositories. Locked notes converge to ciphertext; plain notes
  // discard unused staged ciphertext; images of already-purged notes retry GC.
  await imageRepository.recoverPendingImageOperations()

  // Backfill preview/title text written before the per-block extraction fix,
  // and repoint documents at fonts the editor still offers; both are one-time
  // no-ops after their first run on a device (see the method docs).
  await noteRepository.migrateDocumentTextFields()
  await noteRepository.migrateRetiredFonts()

  return { noteRepository, imageRepository }
}

export async function createNoteRepository(options: CreateNoteRepositoryOptions) {
  const { noteRepository } = await createRepositories(options)
  return noteRepository
}

import { createAutomationEventBus } from '@/automation'
import { createLocalNotesStore, type LocalStoreRuntime } from '@/local-store'
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
}

export async function createNoteRepository(options: CreateNoteRepositoryOptions) {
  const localStore = await createLocalNotesStore({
    runtime: options.runtime,
    databaseName: options.databaseName,
  })
  const parsedUserId = userIdSchema.parse(options.userId)
  const automationEvents = createAutomationEventBus({
    localStore,
    userId: parsedUserId,
    clock: options.clock,
  })

  return new DefaultNoteRepository({
    automationEvents,
    localStore,
    userId: parsedUserId,
    deviceId: options.deviceId,
    clock: options.clock,
    idFactory: options.idFactory,
  })
}

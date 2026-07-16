import type { NoteRepository } from '@/repository/contracts'
import type {
  AutomationEvent,
  AutomationHandler,
  AutomationLocalApiContract,
  AutomationNoteReadOptions,
  CreateNoteInput,
  NoteDetail,
  NoteId,
  UpdateNotePatch,
} from '@/shared/contracts'
import { createAutomationEventBus, type AutomationEventBus } from './event-bus'

export type AutomationGatewayDependencies = {
  eventBus?: AutomationEventBus
  noteRepository: NoteRepository
}

export interface AutomationReadHandler {
  readNote(noteId: NoteId, options?: AutomationNoteReadOptions): Promise<NoteDetail | null>
}

export interface AutomationWriteHandler {
  createNote(input?: CreateNoteInput): Promise<NoteId>
  deleteNote(noteId: NoteId): Promise<void>
  updateNote(noteId: NoteId, patch: UpdateNotePatch): Promise<void>
}

export interface AutomationGateway extends AutomationReadHandler, AutomationWriteHandler {
  emit(event: AutomationEvent): Promise<void>
  getLocalApiContract(): AutomationLocalApiContract
  registerHandler(handler: AutomationHandler): () => void
  start(): Promise<void>
  stop(): Promise<void>
}

export const automationLocalApiContract: AutomationLocalApiContract = {
  basePath: '/v1',
  enabledByDefault: false,
  transport: 'post-mvp-local-http',
  endpoints: [
    { method: 'GET', path: '/notes', implemented: false },
    { method: 'GET', path: '/notes/:id', implemented: false },
    { method: 'POST', path: '/notes', implemented: false },
    { method: 'PATCH', path: '/notes/:id', implemented: false },
    { method: 'DELETE', path: '/notes/:id', implemented: false },
  ],
}

function getChangedFields(patch: UpdateNotePatch): string[] {
  return Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
}

export class DefaultAutomationGateway implements AutomationGateway {
  private readonly eventBus: AutomationEventBus
  private readonly noteRepository: NoteRepository

  constructor(dependencies: AutomationGatewayDependencies) {
    this.eventBus = dependencies.eventBus ?? createAutomationEventBus()
    this.noteRepository = dependencies.noteRepository
  }

  async start(): Promise<void> {
    await Promise.resolve()
  }

  async stop(): Promise<void> {
    await Promise.resolve()
  }

  async emit(event: AutomationEvent): Promise<void> {
    await this.eventBus.emit(event)
  }

  registerHandler(handler: AutomationHandler): () => void {
    return this.eventBus.registerHandler(handler)
  }

  getLocalApiContract(): AutomationLocalApiContract {
    return automationLocalApiContract
  }

  async readNote(
    noteId: NoteId,
    options: AutomationNoteReadOptions = {},
  ): Promise<NoteDetail | null> {
    const note = await this.noteRepository.getNote(noteId)

    if (!note) {
      return null
    }

    if (note.isLocked && options.mode === 'plaintext') {
      throw new Error(
        'Automation plaintext reads for locked notes require explicit unlock grants and are not implemented in MVP.',
      )
    }

    return note
  }

  async createNote(input: CreateNoteInput = {}): Promise<NoteId> {
    const noteId = await this.noteRepository.createNote(input)
    await this.emit({ type: 'note.created', noteId })
    return noteId
  }

  async updateNote(noteId: NoteId, patch: UpdateNotePatch): Promise<void> {
    await this.noteRepository.updateNote(noteId, patch)
    await this.emit({
      type: 'note.updated',
      noteId,
      changedFields: getChangedFields(patch),
    })
  }

  async deleteNote(noteId: NoteId): Promise<void> {
    await this.noteRepository.deleteNote(noteId)
    await this.emit({ type: 'note.deleted', noteId })
  }
}

export function createAutomationGateway(
  dependencies: AutomationGatewayDependencies,
): AutomationGateway {
  return new DefaultAutomationGateway(dependencies)
}

import { createChatDocument } from '@/shared/contracts/chat'
import {
  createNoteInputSchema,
  type CreateNoteInput,
  type NotePropertyStatus,
} from '@/shared/contracts/note'
import type { DocumentNode, NoteDocument } from '@/shared/contracts/document'

export const noteTemplateIds = ['blank', 'chat', 'daily', 'meeting', 'project'] as const
export type NoteTemplateId = (typeof noteTemplateIds)[number]

export type NoteTemplateSummary = {
  description: string
  id: NoteTemplateId
  label: string
  status: NotePropertyStatus
  tags: string[]
}

export const noteTemplates: NoteTemplateSummary[] = [
  {
    id: 'blank',
    label: 'Blank note',
    description: 'A clean page with no structure.',
    status: 'none',
    tags: [],
  },
  {
    id: 'chat',
    label: 'Chat',
    description: 'A private message stream, like your saved-messages chat.',
    status: 'none',
    tags: [],
  },
  {
    id: 'daily',
    label: 'Daily note',
    description: 'A light structure for plans, notes and reflections.',
    status: 'active',
    tags: ['daily'],
  },
  {
    id: 'meeting',
    label: 'Meeting notes',
    description: 'Agenda, decisions and follow-up actions.',
    status: 'active',
    tags: ['meeting'],
  },
  {
    id: 'project',
    label: 'Project brief',
    description: 'Outcome, context, next steps and open questions.',
    status: 'idea',
    tags: ['project'],
  },
]

function text(value: string): DocumentNode {
  return { type: 'paragraph', content: [{ type: 'text', text: value }] }
}

function heading(value: string, level = 2): DocumentNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text: value }],
  }
}

function task(value: string): DocumentNode {
  return {
    type: 'taskList',
    content: [
      {
        type: 'taskItem',
        attrs: { checked: false },
        content: [text(value)],
      },
    ],
  }
}

function document(content: DocumentNode[]): NoteDocument {
  return {
    schemaVersion: 1,
    editor: 'tiptap',
    content: { type: 'doc', content },
  }
}

function formatLocalDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function createNoteFromTemplate(
  templateId: NoteTemplateId,
  now = new Date(),
): CreateNoteInput {
  const summary = noteTemplates.find((template) => template.id === templateId)

  if (!summary) {
    throw new Error(`Unknown note template: ${templateId}`)
  }

  const properties = {
    status: summary.status,
    tags: summary.tags,
    ...(templateId === 'chat' ? { kind: 'chat' as const } : {}),
  }

  if (templateId === 'blank') {
    return createNoteInputSchema.parse({ title: 'Untitled', properties })
  }

  if (templateId === 'chat') {
    return createNoteInputSchema.parse({
      title: 'Saved Messages',
      properties,
      document: createChatDocument(),
    })
  }

  if (templateId === 'daily') {
    const date = formatLocalDate(now)
    return createNoteInputSchema.parse({
      title: date,
      properties,
      document: document([
        heading('Today'),
        task('One important thing'),
        heading('Notes'),
        text('Start writing…'),
        heading('Reflection'),
        text('What was worth remembering?'),
      ]),
    })
  }

  if (templateId === 'meeting') {
    return createNoteInputSchema.parse({
      title: 'Meeting notes',
      properties,
      document: document([
        heading('Agenda'),
        text('What needs to be discussed?'),
        heading('Notes'),
        text('Capture the conversation here.'),
        heading('Decisions'),
        text('Record the decisions that were made.'),
        heading('Next steps'),
        task('Add an action item'),
      ]),
    })
  }

  return createNoteInputSchema.parse({
    title: 'Project brief',
    properties,
    document: document([
      heading('Outcome'),
      text('What should be true when this project is complete?'),
      heading('Context'),
      text('Why does this matter now?'),
      heading('Next steps'),
      task('Define the first concrete step'),
      heading('Open questions'),
      text('What still needs an answer?'),
    ]),
  })
}

import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'

export const TaskListExtensions = [
  TaskList,
  TaskItem.configure({
    nested: true,
  }),
]

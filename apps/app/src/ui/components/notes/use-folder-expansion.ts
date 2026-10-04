import { useEffect, useState } from 'react'
import type { FolderId, FolderTreeNode } from '@/shared/contracts'

const storageKey = 'umbra.folder-expansion.v1'

export function useFolderExpansion(nodes: FolderTreeNode[], activeId: FolderId | null | undefined) {
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
      return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
    } catch { return [] }
  })
  function findPath(tree: FolderTreeNode[]): string[] | null {
    for (const node of tree) {
      if (node.folder.id === activeId) return []
      const nested = findPath(node.children)
      if (nested) return [node.folder.id, ...nested]
    }
    return null
  }
  const activePath = JSON.stringify(activeId ? ['root', ...(findPath(nodes) ?? [])] : [])
  useEffect(() => {
    const path = JSON.parse(activePath) as string[]
    setCollapsed((previous) => previous.filter((id) => !path.includes(id)))
  }, [activePath, activeId])
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(collapsed)) } catch { /* Session state still works. */ }
  }, [collapsed])
  return {
    isExpanded: (id: string) => !collapsed.includes(id),
    toggle: (id: string) => setCollapsed((previous) => previous.includes(id)
      ? previous.filter((value) => value !== id) : [...previous, id]),
  }
}

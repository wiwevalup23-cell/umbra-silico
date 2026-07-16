export type ArchitectureRoute = {
  id: string
  label: string
  status: 'ready' | 'contract' | 'planned'
}

export const architectureRoutes: ArchitectureRoute[] = [
  { id: 'ui', label: 'UI Components', status: 'ready' },
  { id: 'viewmodel', label: 'UI State & ViewModel', status: 'ready' },
  { id: 'repository', label: 'Repository', status: 'contract' },
  { id: 'sync', label: 'Sync Engine', status: 'contract' },
  { id: 'automation', label: 'Automation Gateway', status: 'contract' },
]

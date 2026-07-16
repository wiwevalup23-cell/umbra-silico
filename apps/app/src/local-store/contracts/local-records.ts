export type StoredNoteRow = {
  id: string
  userId: string
  schemaVersion: number
  title: string | null
  preview: string | null
  isLocked: 0 | 1
  document: string | null
  encryptedPayload: string | null
  encryption: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  parentFolderId: string | null
  localRevision: number
  remoteRevision: number | null
  baseRemoteRevision: number | null
  syncStatus: string
  lastOpId: string | null
  deviceId: string
}

export type StoredFolderRow = {
  id: string
  userId: string
  name: string
  parentFolderId: string | null
  sortIndex: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  localRevision: number
  syncStatus: string
  deviceId: string
}

export type StoredSyncOperationRow = {
  opId: string
  noteId: string
  userId: string
  deviceId: string
  type: string
  payload: string
  baseRemoteRevision: number | null
  createdAt: string
  attemptCount: number
  lastError: string | null
  status: string
}

export type StoredSyncStateRow = {
  key: string
  value: string
  updatedAt: string
}

export type StoredCryptoProfileRow = {
  userId: string
  version: number
  kdf: string
  salt: string
  wrappedMasterKey: string
  wrapNonce: string
  updatedAt: string
}

export type StoredAutomationEventRow = {
  id: string
  userId: string
  noteId: string | null
  eventType: string
  payload: string
  createdAt: string
  deliveredAt: string | null
}

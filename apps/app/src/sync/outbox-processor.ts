import type { NoteRepository } from '@/repository/contracts'
import type { SyncOperation } from '@/shared/contracts'
import { pushOperation, type RemotePushResult } from '@/sync/remote-push'
import type { SupabaseRemoteGateway } from '@/sync/supabase'

export type SyncSleep = (durationMs: number) => Promise<void>

export type RetryPolicy = {
  baseDelayMs: number
  maxAttempts: number
  maxDelayMs: number
}

export type OutboxProcessorDependencies = {
  noteRepository: NoteRepository
  remoteGateway: SupabaseRemoteGateway
  retryPolicy?: Partial<RetryPolicy>
  sleep?: SyncSleep
}

export type OutboxProcessResult = {
  failed: SyncOperation[]
  pushed: RemotePushResult[]
}

const defaultRetryPolicy: RetryPolicy = {
  baseDelayMs: 350,
  maxAttempts: 3,
  maxDelayMs: 4000,
}

const defaultSleep: SyncSleep = (durationMs) =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })

function createRetryPolicy(policy: Partial<RetryPolicy> = {}): RetryPolicy {
  return {
    ...defaultRetryPolicy,
    ...policy,
  }
}

function getBackoffDelay(policy: RetryPolicy, attempt: number): number {
  return Math.min(policy.baseDelayMs * 2 ** Math.max(0, attempt - 1), policy.maxDelayMs)
}

function errorToString(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function processOutbox({
  limit = 50,
  noteRepository,
  remoteGateway,
  retryPolicy,
  sleep = defaultSleep,
}: OutboxProcessorDependencies & {
  limit?: number
}): Promise<OutboxProcessResult> {
  const policy = createRetryPolicy(retryPolicy)
  const pendingOperations = await noteRepository.getPendingOps(limit)
  const pushed: RemotePushResult[] = []
  const failed: SyncOperation[] = []

  for (const operation of pendingOperations) {
    let attempt = operation.attemptCount
    let pushedOperation: RemotePushResult | null = null
    let lastError: unknown = null

    while (attempt < policy.maxAttempts && !pushedOperation) {
      try {
        pushedOperation = await pushOperation({
          noteRepository,
          operation,
          remoteGateway,
        })
      } catch (error) {
        lastError = error
        attempt += 1

        if (attempt < policy.maxAttempts) {
          await sleep(getBackoffDelay(policy, attempt))
        }
      }
    }

    if (pushedOperation) {
      pushed.push(pushedOperation)
    } else {
      failed.push(operation)
      await noteRepository.markOpFailed(
        operation.opId,
        errorToString(lastError ?? 'Unknown outbox push error.'),
      )
    }
  }

  return { failed, pushed }
}

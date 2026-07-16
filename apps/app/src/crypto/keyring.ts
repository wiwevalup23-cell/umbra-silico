import type {
  LocalCryptoProfile,
  LockCredentials,
  UnlockCredentials,
  UserId,
} from '@/shared/contracts'
import { createCryptoService, type CryptoService } from '@/crypto/crypto-service'

export type KeyringState = 'locked' | 'unlocked'

export type ResolveMasterKeyResult = {
  createdProfile: boolean
  masterKey: CryptoKey
  profile: LocalCryptoProfile
}

export interface Keyring {
  clear(userId?: UserId): void
  getState(userId: UserId): KeyringState
  resolveMasterKeyForLock(input: {
    credentials: LockCredentials
    now: string
    profile: LocalCryptoProfile | null
    userId: UserId
  }): Promise<ResolveMasterKeyResult>
  unlockMasterKey(input: {
    credentials: UnlockCredentials
    profile: LocalCryptoProfile
    userId: UserId
  }): Promise<CryptoKey>
}

export class InMemoryKeyring implements Keyring {
  private readonly cryptoService: CryptoService
  private readonly masterKeys = new Map<UserId, CryptoKey>()

  constructor(cryptoService: CryptoService = createCryptoService()) {
    this.cryptoService = cryptoService
  }

  clear(userId?: UserId): void {
    if (userId) {
      this.masterKeys.delete(userId)
      return
    }

    this.masterKeys.clear()
  }

  getState(userId: UserId): KeyringState {
    return this.masterKeys.has(userId) ? 'unlocked' : 'locked'
  }

  async resolveMasterKeyForLock({
    credentials,
    now,
    profile,
    userId,
  }: {
    credentials: LockCredentials
    now: string
    profile: LocalCryptoProfile | null
    userId: UserId
  }): Promise<ResolveMasterKeyResult> {
    if (!profile) {
      const created = await this.cryptoService.createMasterKeyProfile({
        credentials,
        now,
        userId,
      })
      this.masterKeys.set(userId, created.masterKey)

      return {
        createdProfile: true,
        masterKey: created.masterKey,
        profile: created.profile,
      }
    }

    const masterKey =
      this.masterKeys.get(userId) ??
      (await this.cryptoService.unlockMasterKey(profile, credentials))
    this.masterKeys.set(userId, masterKey)

    return {
      createdProfile: false,
      masterKey,
      profile,
    }
  }

  async unlockMasterKey({
    credentials,
    profile,
    userId,
  }: {
    credentials: UnlockCredentials
    profile: LocalCryptoProfile
    userId: UserId
  }): Promise<CryptoKey> {
    if (!credentials.masterPassword) {
      const cachedMasterKey = this.masterKeys.get(userId)

      if (cachedMasterKey) {
        return cachedMasterKey
      }
    }

    const masterKey =
      credentials.masterPassword || !this.masterKeys.has(userId)
        ? await this.cryptoService.unlockMasterKey(profile, credentials)
        : this.masterKeys.get(userId)

    if (!masterKey) {
      throw new Error('Master key is locked.')
    }

    this.masterKeys.set(userId, masterKey)
    return masterKey
  }
}

export function createKeyring(cryptoService?: CryptoService): Keyring {
  return new InMemoryKeyring(cryptoService)
}

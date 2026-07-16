export interface SecureSecretStore {
  getSecret(key: string): Promise<Uint8Array | null>
  removeSecret(key: string): Promise<void>
  setSecret(key: string, value: Uint8Array): Promise<void>
}

export class UnavailableSecureSecretStore implements SecureSecretStore {
  private readonly reason: string

  constructor(reason = 'Secure secret storage is available only in Tauri runtime.') {
    this.reason = reason
  }

  async getSecret(): Promise<Uint8Array | null> {
    throw new Error(this.reason)
  }

  async removeSecret(): Promise<void> {
    throw new Error(this.reason)
  }

  async setSecret(): Promise<void> {
    throw new Error(this.reason)
  }
}

type TauriPathModule = typeof import('@tauri-apps/api/path')

type StrongholdStore = {
  get(key: string): Promise<Uint8Array | null>
  insert(key: string, value: number[]): Promise<void>
  remove(key: string): Promise<Uint8Array | null>
}

type StrongholdClient = {
  getStore(): StrongholdStore
  getVault(name: string): unknown
}

type StrongholdInstance = {
  createClient(name: string): Promise<StrongholdClient>
  loadClient(name: string): Promise<StrongholdClient>
  save(): Promise<void>
}

type StrongholdLoader = {
  load(path: string, password: string): Promise<StrongholdInstance>
}

export type TauriStrongholdSecretStoreDependencies = {
  path?: Pick<TauriPathModule, 'appDataDir' | 'join'>
  stronghold?: {
    Stronghold: StrongholdLoader
  }
}

const strongholdClientName = 'silicon-nostalgia'
const strongholdVaultName = 'secrets'
const strongholdFileName = 'silicon-nostalgia.vault.hold'

export class TauriStrongholdSecretStore implements SecureSecretStore {
  private readonly client: StrongholdClient
  private readonly stronghold: StrongholdInstance

  constructor(input: {
    client: StrongholdClient
    stronghold: StrongholdInstance
  }) {
    this.client = input.client
    this.stronghold = input.stronghold
  }

  async getSecret(key: string): Promise<Uint8Array | null> {
    return this.client.getStore().get(key)
  }

  async removeSecret(key: string): Promise<void> {
    await this.client.getStore().remove(key)
    await this.stronghold.save()
  }

  async setSecret(key: string, value: Uint8Array): Promise<void> {
    await this.client.getStore().insert(key, [...value])
    await this.stronghold.save()
  }

  getVault() {
    return this.client.getVault(strongholdVaultName)
  }
}

export async function createTauriStrongholdSecretStore(
  vaultPassword: string,
  dependencies: TauriStrongholdSecretStoreDependencies = {},
): Promise<TauriStrongholdSecretStore> {
  if (!vaultPassword) {
    throw new Error('Stronghold vault password is required.')
  }

  const [{ Stronghold }, { appDataDir, join }] = await Promise.all([
    dependencies.stronghold
      ? Promise.resolve(dependencies.stronghold)
      : import('@tauri-apps/plugin-stronghold'),
    dependencies.path ? Promise.resolve(dependencies.path) : import('@tauri-apps/api/path'),
  ])
  const vaultPath = await join(await appDataDir(), strongholdFileName)
  const stronghold = await Stronghold.load(vaultPath, vaultPassword)
  let client: StrongholdClient

  try {
    client = await stronghold.loadClient(strongholdClientName)
  } catch {
    client = await stronghold.createClient(strongholdClientName)
    await stronghold.save()
  }

  return new TauriStrongholdSecretStore({ client, stronghold })
}

export function createUnavailableSecureSecretStore(reason?: string): SecureSecretStore {
  return new UnavailableSecureSecretStore(reason)
}

export type Unsubscribe = () => void

export type LiveQuery<TValue> = {
  getSnapshot(): TValue
  subscribe(listener: () => void): Unsubscribe
}

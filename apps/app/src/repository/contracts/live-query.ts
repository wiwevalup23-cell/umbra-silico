export type Unsubscribe = () => void

export type LiveQuery<TValue> = {
  getSnapshot(): TValue
  subscribe(listener: () => void): Unsubscribe
  /**
   * Releases the query from its repository. A LiveQuery holds a registration
   * for as long as it exists, so a caller that creates one per search term or
   * per selected folder must dispose the previous one; otherwise every
   * abandoned query keeps re-reading the store on every future mutation.
   */
  dispose(): void
  /**
   * Brings a released query back into service. React owns effect lifetimes and
   * may release and re-acquire the same object, so disposal has to be
   * reversible rather than terminal.
   */
  retain(): void
}

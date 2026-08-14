function createPdfDocumentTitle(title: string, fallback: string): string {
  const safeTitle = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')

  return safeTitle || fallback
}

/**
 * Opens the platform print dialog for the already-rendered note. The print
 * stylesheet limits the output to the active editor, so text, tables, images,
 * and KaTeX stay crisp instead of being flattened into a screenshot.
 */
export function exportNoteToPdf(
  title: string,
  /** What an untitled note is called, in the reader's language. */
  untitledLabel: string,
  printDocument: () => void = () => window.print(),
): void {
  const previousTitle = document.title

  document.title = createPdfDocumentTitle(title, untitledLabel)

  try {
    printDocument()
  } finally {
    document.title = previousTitle
  }
}

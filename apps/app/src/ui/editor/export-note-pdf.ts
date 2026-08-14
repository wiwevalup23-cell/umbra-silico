function createPdfDocumentTitle(title: string): string {
  const safeTitle = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')

  return safeTitle || 'Untitled'
}

/**
 * Opens the platform print dialog for the already-rendered note. The print
 * stylesheet limits the output to the active editor, so text, tables, images,
 * and KaTeX stay crisp instead of being flattened into a screenshot.
 */
export function exportNoteToPdf(
  title: string,
  printDocument: () => void = () => window.print(),
): void {
  const previousTitle = document.title

  document.title = createPdfDocumentTitle(title)

  try {
    printDocument()
  } finally {
    document.title = previousTitle
  }
}

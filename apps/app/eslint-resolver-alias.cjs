const fs = require('node:fs')
const path = require('node:path')

/**
 * Teaches `eslint-plugin-boundaries` the `@/` alias from tsconfig.
 *
 * Without a resolver every `@/...` import is classified as external, and an
 * external dependency has no element type — so `boundaries/dependencies`
 * matches nothing and silently passes. The layer rules in `eslint.config.js`
 * were dead for exactly that reason: even a relative `ui → repository` import
 * went unreported.
 */
const sourceRoot = path.resolve(__dirname, 'src')
const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css']

function resolveFile(candidate) {
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate
  }

  for (const extension of extensions) {
    const withExtension = `${candidate}${extension}`

    if (fs.existsSync(withExtension)) {
      return withExtension
    }
  }

  for (const extension of extensions) {
    const indexFile = path.join(candidate, `index${extension}`)

    if (fs.existsSync(indexFile)) {
      return indexFile
    }
  }

  return null
}

exports.interfaceVersion = 2

exports.resolve = function resolve(source, file) {
  if (source.startsWith('@/')) {
    const resolved = resolveFile(path.join(sourceRoot, source.slice(2)))

    return resolved ? { found: true, path: resolved } : { found: false }
  }

  if (source.startsWith('.')) {
    const resolved = resolveFile(path.resolve(path.dirname(file), source))

    return resolved ? { found: true, path: resolved } : { found: false }
  }

  // Everything else is a package: let the plugin treat it as external.
  return { found: false }
}

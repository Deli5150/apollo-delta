// Gives the Android build enough memory: Gradle's default 2 GB, with Kotlin compiling in a
// separate daemon beside it, ran out of memory on a busy Mac. Kotlin now compiles inside Gradle.
const { withGradleProperties } = require('expo/config-plugins')

const PROPS = {
  'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m',
  'kotlin.compiler.execution.strategy': 'in-process'
}

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (c) => {
    for (const [key, value] of Object.entries(PROPS)) {
      const existing = c.modResults.find((p) => p.type === 'property' && p.key === key)
      if (existing) existing.value = value
      else c.modResults.push({ type: 'property', key, value })
    }
    return c
  })
}

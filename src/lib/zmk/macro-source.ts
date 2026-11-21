// Index literal macro definitions in the user's keymap while preserving all other
// source text, including comments, includes, key bindings and line endings.
export type SourceMacro = { name: string; start: number; end: number }
export function sourceMacros(source: string): SourceMacro[] {
  const result: SourceMacro[] = []
  const stack: { start: number; leaf: boolean }[] = []
  const clean = source.replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, (match) =>
    match.startsWith('"') ? match : match.replace(/[^\r\n]/g, " "),
  )
  for (const token of clean.matchAll(/"(?:\\.|[^"\\])*"|[{}]/g)) {
    if (token[0] === "{") {
      if (stack.length) stack[stack.length - 1].leaf = false
      stack.push({ start: token.index + 1, leaf: true })
    } else if (token[0] === "}") {
      const node = stack.pop()
      if (!node?.leaf) continue
      const body = clean.slice(node.start, token.index)
      if (!/(?:^|;)\s*compatible\s*=\s*"zmk,behavior-macro(?:-one-param|-two-param)?"\s*;/.test(body))
        continue
      const name =
        /(?:^|;)\s*display-name\s*=\s*"([^"]+)"\s*;/.exec(body) ??
        /(?:^|;)\s*label\s*=\s*"([^"]+)"\s*;/.exec(body)
      const prop = /(?:^|;)(\s*bindings\s*=\s*)(<[^;]+>)\s*;/.exec(body)
      if (!name || !prop || /^\s*#\s*(?:if|ifdef|ifndef|else|elif|endif|include|define)\b/m.test(body))
        continue
      const start = node.start + prop.index + prop[0].indexOf("<")
      result.push({ name: name[1], start, end: start + prop[2].length })
    }
  }
  return result
}
export function replaceMacroBodies(
  source: string,
  macros: SourceMacro[],
  changes: Record<number, string>,
) {
  let next = source
  for (const { start, end } of [...macros].reverse()) {
    if (Object.hasOwn(changes, start)) next = next.slice(0, start) + changes[start] + next.slice(end)
  }
  return next
}

export type SourceStep = { mode: "tap" | "press" | "release"; key: string }
export function keySteps(body: string): SourceStep[] | undefined {
  if (!/^\s*<[\s\S]+>\s*$/.test(body)) return
  const tokens = body.trim().slice(1, -1).trim().split(/\s+/)
  const steps: SourceStep[] = []
  let mode: SourceStep["mode"] = "tap"
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token === "&macro_tap") mode = "tap"
    else if (token === "&macro_press") mode = "press"
    else if (token === "&macro_release") mode = "release"
    else if (token === "&kp" && isKeyExpression(tokens[i + 1] ?? ""))
      steps.push({ mode, key: tokens[++i] })
    else return
  }
  return steps
}
export function isKeyExpression(key: string) {
  return (
    /^(?:[A-Z][A-Z0-9_]*\()*[A-Z][A-Z0-9_]*\)*$/.test(key) &&
    (key.match(/\(/g)?.length ?? 0) === (key.match(/\)/g)?.length ?? 0)
  )
}
export function stepBindings(steps: SourceStep[]) {
  let previous = ""
  const bindings: string[] = []
  for (const step of steps) {
    if (previous !== step.mode) bindings.push("&macro_" + step.mode)
    bindings.push("&kp " + step.key)
    previous = step.mode
  }
  return "<" + bindings.join(" ") + ">"
}

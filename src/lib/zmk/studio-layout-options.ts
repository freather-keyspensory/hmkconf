import type { PhysicalLayouts } from '@zmkfirmware/zmk-studio-ts-client/keymap'

type Field = { label: string; choices: [token: string, label: string][] }

// Some TKL firmwares abbreviate their default tuple as "ANSI 87".
const tklFields: Field[] = [
  { label: 'F13 key', choices: [['F12', 'F12'], ['F13', 'F13']] },
  { label: 'ISO Enter', choices: [['ANSI', 'ANSI'], ['ISO', 'ISO']] },
  { label: 'Split Backspace', choices: [['BS2', '2u'], ['BS1+1', '1u + 1u']] },
  { label: 'Split left Shift', choices: [['LS2.25', '2.25u'], ['LS1.25+1', '1.25u + 1u']] },
  { label: 'Right Shift', choices: [['RS2.75', '2.75u'], ['RS1.75+1', '1.75u + 1u'], ['RS1+1.75', '1u + 1.75u']] },
  { label: 'Spacebar', choices: [['SP6.25', '6.25u'], ['SP4.25-JIS', '4.25u (JIS)'], ['SP7', '7u']] },
]

function describeField(tokens: string[], title?: string): Field | undefined {
  const choices = (label: string): Field => ({ label, choices: tokens.map(token => [token, token]) })
  if (title) return choices(title)

  // "2u Zero" and "Split Zero" describe the same key. On means split,
  // independently of the order the firmware uses for its physical layouts.
  const split = tokens.find(token => /^Split .+/i.test(token))
  if (split && tokens.length === 2) {
    const other = tokens.find(token => token !== split)!
    const suffix = ' ' + split.slice(6)
    if (other.toLowerCase().endsWith(suffix.toLowerCase())) {
      return { label: split, choices: [[other, other.slice(0, -suffix.length)], [split, 'Split']] }
    }
  }
  const words = tokens[0].split(/\s+/)
  for (let n = words.length - 1; n > 0; n--) {
    const prefix = words.slice(0, n).join(' ')
    if (tokens.every(token => token.startsWith(prefix + ' '))) {
      return { label: prefix, choices: tokens.map(token => [token, token.slice(prefix.length + 1)]) }
    }
  }
  for (let n = 1; n < words.length; n++) {
    const suffix = words.slice(n).join(' ')
    if (tokens.every(token => token.endsWith(' ' + suffix))) {
      return { label: suffix, choices: tokens.map(token => [token, token.slice(0, -(suffix.length + 1))]) }
    }
  }
}

const namedField = /^([^:=]+?)\s*[:=]\s*(.+)$/

export function studioLayoutOptions(catalog?: PhysicalLayouts) {
  if (!catalog || !catalog.layouts[catalog.activeLayoutIndex]) return
  const presets = catalog.layouts.map((layout, index) => ({ name: layout.name.trim(), index }))
  const matrixName = 'All wired positions (matrix view)'
  const normal = presets.filter(row => row.name !== matrixName)
  if (!normal.length || presets.length - normal.length > 1) return
  const matrix = presets.find(row => row.name === matrixName)?.index
  // A spaced separator can coexist with literal fractions or slashes inside a value.
  const separator = normal.some(row => /\s\/\s/.test(row.name)) ? /\s+\/\s+/ : '/'
  let rows = normal.map(row => ({ ...row, parts: row.name.split(separator).map(s => s.trim()) }))
  const matchesTkl = (parts: string[]) => parts.length === tklFields.length &&
    parts.every((token, i) => tklFields[i].choices.some(([value]) => token === value))
  const tkl = rows.some(row => matchesTkl(row.parts)) && rows.every(row => row.name === 'ANSI 87' || matchesTkl(row.parts))
  let titles: string[] | undefined
  if (tkl) {
    rows = rows.map(row => row.name === 'ANSI 87' ? { ...row, parts: tklFields.map(field => field.choices[0][0]) } : row)
  } else if (rows.every(row => row.parts.every(part => namedField.test(part)))) {
    // Explicitly named dimensions need not appear in the same order in each preset.
    titles = rows[0].parts.map(part => part.match(namedField)![1].trim())
    if (new Set(titles).size !== titles.length) return
    for (const row of rows) {
      const entries = row.parts.map(part => part.match(namedField)!)
      const byTitle = new Map(entries.map(([, title, value]) => [title.trim(), value.trim()]))
      if (entries.length !== titles.length || !titles.every(title => byTitle.has(title))) return
      row.parts = titles.map(title => byTitle.get(title)!)
    }
  }

  const width = rows[0].parts.length
  if (rows.some(row => row.parts.length !== width || row.parts.some(token => !token))) return
  const byTuple = new Map(rows.map(row => [JSON.stringify(row.parts), row.index]))
  if (byTuple.size !== rows.length) return
  const baseline = (tkl ? rows.find(row => row.name === 'ANSI 87') : undefined) ?? rows[0]
  const selected = catalog.activeLayoutIndex === matrix ? baseline : rows.find(row => row.index === catalog.activeLayoutIndex)
  if (!selected) return

  const groups = rows[0].parts.flatMap((_, column) => {
    const tokens = [...new Set(rows.map(row => row.parts[column]))]
    if (tokens.length < 2) return []
    const field = tkl ? { ...tklFields[column], choices: tklFields[column].choices.filter(([token]) => tokens.includes(token)) }
      : describeField(tokens, titles?.[column])
    if (field) return [{ ...field, column }]
    if (width === 1) return []
    const choices: Field['choices'] = tokens.map(token => [token, token])
    return [{ label: tokens.join(' / '), choices, column }]
  })
  // Unstructured names are complete presets. The shared control handles one,
  // two, or many presets directly without inferring independent settings.
  if (!groups.length) return

  function destination(parts: string[], column: number, token: string) {
    const next = [...parts]
    next[column] = token
    return byTuple.get(JSON.stringify(next))
  }
  // Sparse catalogs can contain interdependent options. Only group them if
  // every reported preset remains reachable through single-control changes.
  if (groups.reduce((count, group) => count * group.choices.length, 1) !== rows.length) {
    const reachable = new Set([baseline.index])
    const byIndex = new Map(rows.map(row => [row.index, row.parts]))
    for (const index of reachable) {
      const parts = byIndex.get(index)!
      for (const { column, choices } of groups) {
        for (const [token] of choices) {
          const next = destination(parts, column, token)
          if (next !== undefined) reachable.add(next)
        }
      }
    }
    if (reachable.size !== rows.length) return
  }

  return {
    labels: groups.map(group => [group.label, ...group.choices.map(([, label]) => label)]),
    values: groups.map(group => group.choices.findIndex(([token]) => token === selected.parts[group.column])),
    resolve(group: number, value: number) {
      const field = groups[group]
      const choice = field?.choices[value]
      return choice && destination(selected.parts, field.column, choice[0])
    },
    baseline: baseline.index,
    matrix,
  }
}

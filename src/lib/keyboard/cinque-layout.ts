import type { KeyboardMetadata } from "./metadata"

// Cinque55 uses physical blockers; its configurator always shows all WK keys.
export function fixedCinqueLayout(
  metadata: KeyboardMetadata,
): KeyboardMetadata {
  if (
    !["Cinque55", "Cinque55 SLSS49E"].includes(metadata.name) ||
    metadata.numKeys !== 62
  )
    return metadata
  const group = metadata.layout.labels.findIndex(
    (label) => Array.isArray(label) && label.includes("7u WK"),
  )
  if (group < 0) return metadata
  const label = metadata.layout.labels[group] as string[]
  const value = label.indexOf("7u WK") - 1
  const keymap = metadata.layout.keymap
    .map((row) =>
      row
        .filter(
          (key) =>
            !key.option || key.option[0] !== group || key.option[1] === value,
        )
        .map((key) => {
          if (!key.option) return key
          if (key.option[0] === group) {
            const { option, ...rest } = key
            return rest
          }
          return {
            ...key,
            option: [
              key.option[0] > group ? key.option[0] - 1 : key.option[0],
              key.option[1],
            ] as [number, number],
          }
        }),
    )
    .filter((row) => row.length > 0)
  const { physicalLayoutOption, ...rest } = metadata
  return {
    ...rest,
    layout: {
      ...metadata.layout,
      keymap,
      labels: metadata.layout.labels.filter((_, index) => index !== group),
    },
  }
}

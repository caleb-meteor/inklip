/**
 * 模糊匹配：用于智能剪辑中主播名、产品名与用户输入 prompt 的匹配
 * 规则：
 * 1. prompt 包含 name 或 name 包含 prompt（归一化后）
 * 2. 短名称（≤4 字）：prompt 包含名称的最后一个字即视为可能匹配（如「剪辑国的内衣」可匹配「召国」「吴召国」）
 * 3. 模糊匹配：prompt 与 name 存在长度≥2 的公共子串即匹配（如「内衣」在 prompt 里可匹配「内衣」「内衣秀」「xx内衣」等），多选时让用户选
 */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '')
}

/** 短名称阈值（字符数），超过则不做“尾字/单字”宽松匹配 */
const SHORT_NAME_MAX_LEN = 4

/**
 * 从候选项列表中筛选出与 prompt 模糊匹配的项（可多选）
 * @param prompt 用户输入文本
 * @param items 候选项列表
 * @param getName 从候选项获取用于匹配的名称
 * @returns 所有匹配的项（可能多条，供用户选择）
 */
export function fuzzyMatchCandidates<T>(
  prompt: string,
  items: T[],
  getName: (item: T) => string
): T[] {
  const normalizedPrompt = normalize(prompt)
  if (!normalizedPrompt) return []

  return items.filter((item) => {
    const name = getName(item)
    if (!name) return false
    const normalizedName = normalize(name)
    // 1. 原有规则：互相包含
    if (normalizedPrompt.includes(normalizedName) || normalizedName.includes(normalizedPrompt)) {
      return true
    }
    // 2. 短名称：prompt 包含名称最后一个字（如「国」）即算匹配
    if (normalizedName.length <= SHORT_NAME_MAX_LEN && normalizedName.length >= 1) {
      const lastChar = normalizedName.slice(-1)
      if (normalizedPrompt.includes(lastChar)) {
        return true
      }
    }
    // 3. 模糊匹配：name 的任意长度≥2 的连续子串若出现在 prompt 中即匹配
    const minSubLen = 2
    for (let start = 0; start < normalizedName.length; start++) {
      for (let len = minSubLen; start + len <= normalizedName.length; len++) {
        const sub = normalizedName.slice(start, start + len)
        if (normalizedPrompt.includes(sub)) {
          return true
        }
      }
    }
    return false
  })
}

/**
 * 使用多个查询词（如 recognize 接口返回的 keywords）对候选项做模糊匹配，合并去重
 * 用于「先用 prompt 匹配不到时，再用关键词匹配」的兜底
 */
export function fuzzyMatchByQueries<T>(
  queries: string[],
  items: T[],
  getName: (item: T) => string,
  getId: (item: T) => number
): T[] {
  if (!queries.length) return []
  const byId = new Map<number, T>()
  for (const q of queries) {
    const trimmed = q.trim()
    if (!trimmed) continue
    const cands = fuzzyMatchCandidates(trimmed, items, getName)
    cands.forEach((item) => byId.set(getId(item), item))
  }
  return Array.from(byId.values())
}

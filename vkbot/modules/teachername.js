function normalizeTeacherName(value) {
    const normalized = String(value ?? "").trim().replace(/\s+/g, " ")
    const match = normalized.match(/^([\p{Script=Cyrillic}-]+)\s+([\p{Script=Cyrillic}])\.(?:\s*([\p{Script=Cyrillic}])\.)?$/u)

    if (!match) return null

    const [, surname, firstInitial, secondInitial] = match
    return `${surname} ${firstInitial.toUpperCase()}.${secondInitial ? `${secondInitial.toUpperCase()}.` : ""}`
}

module.exports = { normalizeTeacherName }

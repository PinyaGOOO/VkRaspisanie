const test = require("node:test")
const assert = require("node:assert/strict")

const { normalizeTeacherName } = require("./teachername")

test("recognizes a teacher with one initial", () => {
    assert.equal(normalizeTeacherName("Ильин Н."), "Ильин Н.")
})

test("keeps support for two initials and normalizes spaces", () => {
    assert.equal(normalizeTeacherName("  Попов   С. А.  "), "Попов С.А.")
})

test("does not treat lesson and group labels as teachers", () => {
    assert.equal(normalizeTeacherName("Иностранный язык"), null)
    assert.equal(normalizeTeacherName("МТОР-24-05"), null)
})

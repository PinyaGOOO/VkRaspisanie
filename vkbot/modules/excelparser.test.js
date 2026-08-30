const test = require("node:test")
const assert = require("node:assert/strict")
const ExcelJS = require("exceljs")

const ExcelParser = require("./excelparser")

test("teacher lesson replaces a stale 2x2 template merge with subject, group and room", async () => {
    const sourceBook = new ExcelJS.Workbook()
    const source = sourceBook.addWorksheet("Очное")
    source.getCell("D2").value = "ОГСЭ.03 Иностранный язык"
    source.getCell("D3").value = "КСК-24-В1"
    source.getCell("E2").value = "А-116"
    source.mergeCells("E2:E3")

    const parser = new ExcelParser(sourceBook, "Очное")
    await parser.createExcel()
    const target = parser.getTargetSheet()
    target.getCell("D2").value = "старый шаблон"
    target.mergeCells("D2:E3")

    await parser.copyLessonSlot2Address(["D2", "E3"], "C1")

    assert.equal(target.getCell("D2").value, "ОГСЭ.03 Иностранный язык")
    assert.equal(target.getCell("D3").value, "КСК-24-В1")
    assert.equal(target.getCell("D2").master.address, "D2")
    assert.equal(target.getCell("D3").master.address, "D3")
    assert.equal(target.getCell("E2").value, "А-116")
    assert.equal(target.getCell("E3").master.address, "E2")
})

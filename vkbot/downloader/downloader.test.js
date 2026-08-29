const assert = require("node:assert/strict")
const fs = require("node:fs")
const http = require("node:http")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")
const iconv = require("iconv-lite")

const downloader = require("./downloader.js")
const {
  academicYear,
  checkForUpdate,
  decodeResponseHtml,
  downloadFile,
  parseBoardTopic,
  parseLatestScheduleData,
  parsePostCount,
  samePostId,
} = downloader._internals

test("academicYear switches in August", () => {
  assert.equal(academicYear(new Date("2026-07-31T18:59:59Z")), "2025/2026")
  assert.equal(academicYear(new Date("2026-07-31T19:00:00Z")), "2026/2027")
})

test("board discovery selects the current academic year", () => {
  const html = `
    <div id="blst_cont">
      <a class="blst_title" href="/topic-999_111">Расписание на 2026/2027 учебный год</a>
      <a class="blst_title" href="/topic-1014995_67489504">Расписание на 2026/2027 учебный год</a>
      <a class="blst_title" href="/topic-1014995_53647274">Расписание на 2025/2026 учебный год</a>
    </div>
  `
  assert.deepEqual(
    parseBoardTopic(html, "https://vk.com/board1014995", new Date(2026, 7, 29)),
    {
      url: "https://vk.com/topic-1014995_67489504",
      title: "Расписание на 2026/2027 учебный год",
    },
  )

  assert.equal(
    parseBoardTopic(
      '<div id="blst_cont"><a class="blst_title" href="/topic-1014995_42">Расписание на 2026–2027 учебный год</a></div>',
      "https://vk.com/board1014995",
      new Date(2026, 7, 29),
    ).url,
    "https://vk.com/topic-1014995_42",
  )
})

test("VK HTML is decoded according to windows-1251 response charset", () => {
  const html = '<div id="bt_summary">44 сообщения</div><div>Расписание</div>'
  const decoded = decodeResponseHtml({
    data: iconv.encode(html, "windows-1251"),
    headers: { "content-type": "text/html; charset=windows-1251" },
  })
  assert.match(decoded, /Расписание/)
  assert.equal(parsePostCount(decoded), 44)
})

test("latest parser uses full post id and hashless document identity", () => {
  const html = `
    <div class="bp_post clear_fix">
      <div class="bp_content" id="bp_data-1014995_7410">
        <div class="bp_text">Тест1</div><span class="bp_date">сегодня в 10:14</span>
        <a class="page_doc_title" href="/doc6222960_710789171?hash=secret">01.09.2026-1.xlsx</a>
      </div>
    </div>
    <div class="bp_post clear_fix">
      <div class="bp_content" id="bp_data-1014995_7409">
        <div class="bp_text">Старое</div><span class="bp_date">вчера</span>
        <a class="page_doc_title" href="/doc6222960_710700000?hash=old">old.xlsx</a>
      </div>
    </div>
    <div class="bp_post clear_fix">
      <div class="bp_content" id="bp_data-1014995_9999">
        <a class="page_doc_title" href="/doc999999_999999?hash=forbidden">foreign.xlsx</a>
      </div>
    </div>
  `
  const latest = parseLatestScheduleData(html)
  assert.equal(latest.postid, "-1014995_7410")
  assert.equal(latest.postdomid, "bp_data-1014995_7410")
  assert.equal(latest.documentid, "doc6222960_710789171")
  assert.equal(latest.documenturl, "https://m.vk.com/doc6222960_710789171")
  assert.match(latest.link, /\?hash=secret$/)
  assert.equal(latest.postcomment, "Тест1")
})

test("legacy four-digit post marker remains compatible", () => {
  assert.equal(samePostId("7410", "-1014995_7410"), true)
  assert.equal(samePostId("7409", "-1014995_7410"), false)
  assert.equal(samePostId("-1014995_7410", "-1014995_7410"), true)
})

test("failed callback does not commit marker and releases single-flight lock", async () => {
  const snapshot = { postid: "-1014995_7410", documentid: "doc6222960_710789171" }
  let commits = 0
  const dependencies = {
    getLatest: async () => snapshot,
    isProcessed: () => false,
    markProcessed: () => { commits++ },
  }

  await assert.rejects(
    checkForUpdate(async (received) => {
      assert.equal(received, snapshot)
      throw new Error("pipeline failed")
    }, dependencies),
    /pipeline failed/,
  )
  assert.equal(commits, 0)

  assert.equal(await checkForUpdate(async () => {}, dependencies), true)
  assert.equal(commits, 1)
})

test("concurrent poll is skipped while the update pipeline is running", async () => {
  const snapshot = { postid: "-1014995_7410", documentid: "doc6222960_710789171" }
  let releasePipeline
  const pipelineGate = new Promise((resolve) => { releasePipeline = resolve })
  let commits = 0
  const dependencies = {
    getLatest: async () => snapshot,
    isProcessed: () => false,
    markProcessed: () => { commits++ },
  }

  const firstPoll = checkForUpdate(async () => pipelineGate, dependencies)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(await checkForUpdate(async () => {}, dependencies), false)
  assert.equal(commits, 0)

  releasePipeline()
  assert.equal(await firstPoll, true)
  assert.equal(commits, 1)
})

test("download waits for the complete stream and atomically renames it", async (t) => {
  const expected = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("complete xlsx-like payload")])
  const server = http.createServer((request, response) => {
    response.write(expected.subarray(0, 8))
    setTimeout(() => response.end(expected.subarray(8)), 20)
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))

  const tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vkbot-downloader-"))
  t.after(() => fs.promises.rm(tempDirectory, { recursive: true, force: true }))
  const destination = path.join(tempDirectory, "schedule.xlsx")
  const address = server.address()

  assert.equal(
    await downloadFile(`http://127.0.0.1:${address.port}/schedule.xlsx`, destination),
    destination,
  )
  assert.deepEqual(await fs.promises.readFile(destination), expected)
  assert.deepEqual(await fs.promises.readdir(tempDirectory), ["schedule.xlsx"])
})

test("an expired document response cannot replace the last valid XLSX", async (t) => {
  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "text/html")
    response.end("<html>expired document hash</html>")
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))

  const tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vkbot-downloader-invalid-"))
  t.after(() => fs.promises.rm(tempDirectory, { recursive: true, force: true }))
  const destination = path.join(tempDirectory, "schedule.xlsx")
  const previous = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("previous valid file")])
  await fs.promises.writeFile(destination, previous)
  const address = server.address()

  await assert.rejects(
    downloadFile(`http://127.0.0.1:${address.port}/expired`, destination),
    /не XLSX\/ZIP/,
  )
  assert.deepEqual(await fs.promises.readFile(destination), previous)
  assert.deepEqual(await fs.promises.readdir(tempDirectory), ["schedule.xlsx"])
})

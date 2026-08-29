const axios = require("axios")
const cheerio = require("cheerio")
const fs = require("fs")
const path = require("path")
const { pipeline } = require("stream/promises")
const iconv = require("iconv-lite")

const { vk } = require("../cfg.json")
const settings = require("../settings.js")
const storage = require("../helpers/globaldata.js")

const SOURCE_CONFIG_PATH = path.join(__dirname, "../schedule-source.json")
const SCHEDULE_PATH = "./files/schedule.xlsx"
const PAGE_TIMEOUT_MS = 30_000
const DOWNLOAD_TIMEOUT_MS = 60_000
const TOPIC_DISCOVERY_TTL_MS = 60 * 60 * 1000
const SCHEDULE_TIMEZONE = "Asia/Yekaterinburg"

const requestHeaders = {
  "User-Agent": vk.userAgent,
  Cookie: "remixmdevice=1920/1080/1/!!-!!!!!!!!;",
}

const pageRequestConfig = {
  responseType: "arraybuffer",
  timeout: PAGE_TIMEOUT_MS,
  headers: requestHeaders,
}

storage.init("vk_comment")
storage.init("vk_lastupdate")
storage.set("vk_lastupdate", "")
storage.set("vk_comment", "")

let idleTimer = null
let pollInFlight = false
let lastSourceWarning = ""
let lastBoardWarning = ""
let lastDiscoveredTopic = ""
let discoveredTopicCache = null

function warnOnce(kind, message) {
  if (kind === "source") {
    if (lastSourceWarning === message) return
    lastSourceWarning = message
  } else {
    if (lastBoardWarning === message) return
    lastBoardWarning = message
  }
  console.warn(message)
}

function readSourceConfig() {
  let source = null
  try {
    source = JSON.parse(fs.readFileSync(SOURCE_CONFIG_PATH, "utf8"))
    lastSourceWarning = ""
  } catch (error) {
    if (error?.code !== "ENOENT") {
      warnOnce("source", `[downloader] не удалось прочитать schedule-source.json: ${error.message}; используется cfg.json`)
    }
  }

  const configuredUrl = typeof source === "string"
    ? source
    : source?.url || source?.scheduleUrl || source?.schedule?.url || source?.vk?.schedule?.url
  const fallbackUrl = typeof configuredUrl === "string" && configuredUrl.trim()
    ? configuredUrl.trim()
    : vk?.schedule?.url?.trim()

  if (!fallbackUrl) throw new Error("Не задан URL источника расписания")
  if (source && typeof source !== "string" && !configuredUrl) {
    warnOnce("source", "[downloader] schedule-source.json не содержит URL, используется cfg.json")
  }

  const boardUrl = typeof source === "object" && source
    ? source.boardUrl || source.boardurl || source.board?.url || source.board
    : ""
  return {
    url: fallbackUrl,
    boardUrl: typeof boardUrl === "string" ? boardUrl.trim() : "",
  }
}

function getScheduleSourceUrl() {
  return readSourceConfig().url
}

function normalizeCharset(value) {
  const charset = (value || "").trim().toLowerCase().replace(/^['"]|['"]$/g, "")
  if (charset === "win-1251" || charset === "cp1251") return "windows-1251"
  return charset
}

function decodeResponseHtml(response) {
  const buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data)
  const contentType = response.headers?.["content-type"] || ""
  const headerCharset = contentType.match(/charset\s*=\s*['"]?([^\s;'"/>]+)/i)?.[1]
  const headerProbe = buffer.subarray(0, 8192).toString("latin1")
  const metaCharset = headerProbe.match(/<meta[^>]+charset\s*=\s*['"]?\s*([^\s;'"/>]+)/i)?.[1]
    || headerProbe.match(/<meta[^>]+content\s*=\s*['"][^'"]*charset\s*=\s*([^\s;'"/>]+)/i)?.[1]
  const charset = normalizeCharset(headerCharset || metaCharset || "windows-1251")

  if (!iconv.encodingExists(charset)) {
    throw new Error(`Неизвестная кодировка страницы VK: ${charset}`)
  }
  return iconv.decode(buffer, charset)
}

function academicYear(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TIMEZONE,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date)
  const year = Number(parts.find((part) => part.type === "year")?.value)
  const month = Number(parts.find((part) => part.type === "month")?.value)
  const start = month >= 8 ? year : year - 1
  return `${start}/${start + 1}`
}

function parseBoardTopic(html, boardUrl, date = new Date()) {
  const $ = cheerio.load(html, { decodeEntities: false })
  const expectedYear = academicYear(date)
  const boardGroupId = new URL(boardUrl).pathname.match(/^\/board(-?\d+)/)?.[1]
  let result = null

  $("#blst_cont a.blst_title").each((index, element) => {
    if (result) return
    const anchor = $(element)
    const title = anchor.text().replace(/\s+/g, " ").trim()
    const [startYear, endYear] = expectedYear.split("/")
    const yearPattern = new RegExp(`${startYear}\\s*[/–—-]\\s*${endYear}`)
    if (!/расписан/i.test(title) || !yearPattern.test(title)) return

    const href = anchor.attr("href")
    if (!href) return
    try {
      const topicUrl = new URL(href, boardUrl)
      const topicGroupId = topicUrl.pathname.match(/^\/topic(-?\d+)_\d+/)?.[1]
      if (!boardGroupId || !topicGroupId || Math.abs(Number(boardGroupId)) !== Math.abs(Number(topicGroupId))) return
      result = { url: topicUrl.toString(), title }
    } catch {}
  })
  return result
}

async function discoverTopic(date = new Date()) {
  const source = readSourceConfig()
  if (!source.boardUrl) return source.url
  const cacheKey = `${source.boardUrl}|${source.url}|${academicYear(date)}`
  if (discoveredTopicCache?.key === cacheKey && discoveredTopicCache.expiresAt > Date.now()) {
    return discoveredTopicCache.url
  }

  try {
    const response = await axios.get(source.boardUrl, pageRequestConfig)
    const found = parseBoardTopic(decodeResponseHtml(response), source.boardUrl, date)
    if (!found) {
      warnOnce("board", `[downloader] на board не найдена тема расписания за ${academicYear(date)}, используется ${source.url}`)
      return source.url
    }

    lastBoardWarning = ""
    if (found.url !== lastDiscoveredTopic) {
      console.log(`[downloader] тема расписания: ${found.title} — ${found.url}`)
      lastDiscoveredTopic = found.url
    }
    discoveredTopicCache = {
      key: cacheKey,
      url: found.url,
      expiresAt: Date.now() + TOPIC_DISCOVERY_TTL_MS,
    }
    return found.url
  } catch (error) {
    warnOnce("board", `[downloader] не удалось проверить board: ${error.message}; используется ${source.url}`)
    return source.url
  }
}

function parsePostCount(html) {
  const $ = cheerio.load(html)
  const summary = $("#bt_summary").text().replace(/\u00a0/g, " ").trim()
  const numericPart = summary.match(/\d[\d\s]*/)?.[0]
  const count = numericPart ? Number(numericPart.replace(/\s/g, "")) : NaN
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Не удалось определить число записей в теме VK (bt_summary=${JSON.stringify(summary)})`)
  }
  return count
}

function extractPostId(rawId) {
  const value = (rawId || "").trim()
  const match = value.match(/(-?\d+_\d+)$/)
  return match ? match[1] : ""
}

function parseDocumentLink(href) {
  if (!href) return null

  let url
  try {
    url = new URL(href, "https://m.vk.com")
  } catch {
    return null
  }

  const match = url.pathname.match(/^\/doc(-?\d+_\d+)/)
  if (!match) return null

  const documentid = `doc${match[1]}`
  const ownerid = match[1].split("_")[0]
  const cleanUrl = new URL(url)
  cleanUrl.search = ""
  cleanUrl.hash = ""

  return {
    link: url.toString(),
    documentid,
    documenturl: cleanUrl.toString(),
    ownerid,
  }
}

function postSequence(postid) {
  const match = (postid || "").match(/_(\d+)$/)
  return match ? Number(match[1]) : -1
}

function parseLatestScheduleData(html) {
  const $ = cheerio.load(html, { decodeEntities: false })
  const candidates = []

  $(".bp_post.clear_fix").each((index, element) => {
    const message = $(element)
    const document = parseDocumentLink(message.find("a.page_doc_title").first().attr("href"))
    if (!document || !vk.validuserids?.[document.ownerid]) return

    const postdomid = message.find(".bp_content[id]").first().attr("id") || ""
    const postid = extractPostId(postdomid)
    if (!postid) return

    candidates.push({
      postcomment: message.find("div.bp_text").first().text().trim(),
      posttime: message.find(".bp_date").first().text().trim(),
      postid,
      postdomid,
      link: document.link,
      documentid: document.documentid,
      documenturl: document.documenturl,
      _index: index,
    })
  })

  if (candidates.length === 0) {
    throw new Error("В теме VK не найден документ расписания от разрешённого автора")
  }

  candidates.sort((left, right) => {
    const sequenceDelta = postSequence(left.postid) - postSequence(right.postid)
    return sequenceDelta || left._index - right._index
  })
  const latest = candidates[candidates.length - 1]
  delete latest._index
  return latest
}

function topicPageUrl(sourceUrl, offset) {
  const url = new URL(sourceUrl)
  url.searchParams.set("offset", String(offset))
  return url.toString()
}

function publishLatest(data) {
  storage.set("vk_comment", data.postcomment || "")
  storage.set("vk_lastupdate", data.posttime || "")
  storage.set("vk_url", data.link)
}

async function getLatest() {
  const sourceUrl = await discoverTopic()
  const firstResponse = await axios.get(sourceUrl, pageRequestConfig)
  const firstHtml = decodeResponseHtml(firstResponse)
  const postCount = parsePostCount(firstHtml)
  const offset = Math.max(postCount - 19, 0)

  const pageHtml = offset === 0
    ? firstHtml
    : decodeResponseHtml(await axios.get(topicPageUrl(sourceUrl, offset), pageRequestConfig))
  const data = parseLatestScheduleData(pageHtml)
  data.sourceurl = sourceUrl
  publishLatest(data)
  return data
}

function storedDocumentId() {
  const explicit = settings.get("documentid", "")
  if (explicit) return explicit
  return parseDocumentLink(settings.get("scheduleurl", ""))?.documentid || ""
}

function samePostId(stored, current) {
  if (!stored || !current) return false
  if (stored === current) return true
  // Совместимость со старым marker, где сохранялись только последние 4 цифры post id.
  return /^\d+$/.test(stored) && current.endsWith(`_${stored}`)
}

function isProcessed(data) {
  return samePostId(settings.get("postid", ""), data.postid)
    && storedDocumentId() === data.documentid
}

function markProcessed(data) {
  const markers = {
    posttime: data.posttime || "",
    scheduleurl: data.link,
    documentid: data.documentid,
    postid: data.postid,
  }

  if (typeof settings.setMany === "function") {
    settings.setMany(markers)
    return
  }

  // Обратная совместимость до появления атомарного settings.setMany().
  // postid пишется последним и выступает commit-marker.
  settings.set("posttime", markers.posttime)
  settings.set("scheduleurl", markers.scheduleurl)
  settings.set("documentid", markers.documentid)
  settings.set("postid", markers.postid)
}

async function downloadFile(url, destination = SCHEDULE_PATH) {
  const absoluteDestination = path.resolve(destination)
  const tempPath = `${absoluteDestination}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  await fs.promises.mkdir(path.dirname(absoluteDestination), { recursive: true })

  try {
    const response = await axios.get(url, {
      responseType: "stream",
      timeout: DOWNLOAD_TIMEOUT_MS,
      headers: requestHeaders,
    })
    await pipeline(response.data, fs.createWriteStream(tempPath, { flags: "wx" }))

    const stat = await fs.promises.stat(tempPath)
    if (stat.size === 0) throw new Error("VK вернул пустой файл расписания")

    const handle = await fs.promises.open(tempPath, "r")
    const signature = Buffer.alloc(2)
    let bytesRead
    try {
      ({ bytesRead } = await handle.read(signature, 0, signature.length, 0))
    } finally {
      await handle.close()
    }
    if (bytesRead !== 2 || signature[0] !== 0x50 || signature[1] !== 0x4b) {
      throw new Error("VK вернул не XLSX/ZIP (возможно, ссылка на документ устарела)")
    }

    await fs.promises.rename(tempPath, absoluteDestination)
    return destination
  } catch (error) {
    await fs.promises.unlink(tempPath).catch(() => {})
    throw error
  }
}

async function run(snapshot) {
  let data
  if (!snapshot) {
    data = await getLatest()
  } else if (typeof snapshot === "string") {
    const document = parseDocumentLink(snapshot)
    if (!document) throw new Error("Некорректная ссылка на документ расписания")
    data = { ...document }
  } else {
    data = snapshot
  }

  if (!data?.link) throw new Error("Не найдена ссылка на расписание")
  publishLatest(data)
  console.log("Скачиваем расписание:", data.documenturl || parseDocumentLink(data.link)?.documenturl || data.link)
  const filepath = await downloadFile(data.link)
  console.log("Сохраняем:", filepath)
  return filepath
}

async function checkForUpdate(cb, dependencies = {}) {
  if (pollInFlight) {
    console.log("[downloader] предыдущая проверка ещё выполняется — цикл пропущен")
    return false
  }

  pollInFlight = true
  try {
    const loadLatest = dependencies.getLatest || getLatest
    const checkProcessed = dependencies.isProcessed || isProcessed
    const commitProcessed = dependencies.markProcessed || markProcessed
    const data = await loadLatest()
    if (checkProcessed(data)) return false

    console.log(`[downloader] найдено обновление: post=${data.postid}, document=${data.documentid}`)
    await cb(data)
    commitProcessed(data)
    console.log(`[downloader] обновление обработано: post=${data.postid}, document=${data.documentid}`)
    return true
  } finally {
    pollInFlight = false
  }
}

function idle(cb) {
  if (typeof cb !== "function") throw new TypeError("idle(cb): cb должен быть функцией")
  if (idleTimer) return idleTimer

  const configuredDelay = Number(vk.requestdelay) * 1000
  const delay = Number.isFinite(configuredDelay) && configuredDelay > 0 ? configuredDelay : 60_000
  idleTimer = setInterval(() => {
    checkForUpdate(cb).catch((error) => {
      console.error("[downloader] ошибка проверки/обработки расписания:", error?.message || error)
    })
  }, delay)
  return idleTimer
}

module.exports.getScheduleLink = () => settings.get("scheduleurl", "")
module.exports.getLatest = getLatest
module.exports.markProcessed = markProcessed
module.exports.run = run
module.exports.idle = idle

module.exports._internals = {
  academicYear,
  checkForUpdate,
  decodeResponseHtml,
  discoverTopic,
  downloadFile,
  extractPostId,
  getScheduleSourceUrl,
  isProcessed,
  parseBoardTopic,
  parseDocumentLink,
  parseLatestScheduleData,
  parsePostCount,
  samePostId,
  topicPageUrl,
}

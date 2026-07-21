const db = require("../../database/db.js")
const storage = require("../../helpers/globaldata.js")
const tasker = require("../requestqueue.js")
const getimages = require("../../modules/getimagebyname.js")
const { vk } = require("../../cfg.json")
const settings = require("../../settings.js")

// Настройки рассылки
const BROADCAST_CONCURRENCY = 12   // сколько сообщений держим "в полёте" одновременно
const BROADCAST_RATE = 15          // не более N сообщений в секунду (лимит VK ~20/сек, оставляем запас)

let running = false // защита от параллельного запуска двух рассылок

// Повтор при временных ошибках (6 — too many requests, 10 — internal, сетевые).
// Постоянные (901/902 — юзер запретил ЛС) пробрасываем сразу.
async function withRetry(fn, tries = 2) {
    let lastErr
    for (let t = 0; t < tries; t++) {
        try { return await fn() }
        catch (e) {
            lastErr = e
            const code = e?.code
            const transient = code === 6 || code === 10 || code === undefined
            if (!transient) throw e
            await new Promise(r => setTimeout(r, 400 * (t + 1)))
        }
    }
    throw lastErr
}

const getAllSubscribers = () => new Promise((resolve, reject) => {
    db.all(
        `SELECT userid, subscribes FROM users WHERE subscribes IS NOT NULL AND subscribes != '{}'`,
        (err, rows) => (err ? reject(err) : resolve(rows || []))
    )
})

// Обработать items с ограничением на одновременность
async function mapLimit(items, limit, fn) {
    let i = 0
    const worker = async () => {
        while (i < items.length) {
            const idx = i++
            await fn(items[idx], idx)
        }
    }
    const n = Math.max(1, Math.min(limit, items.length))
    await Promise.all(Array.from({ length: n }, worker))
}

// Ограничитель скорости: разносит старты вызовов не чаще чем perSecond в секунду
function makeRateLimiter(perSecond) {
    const interval = 1000 / perSecond
    let next = 0
    return function slot() {
        const now = Date.now()
        const at = Math.max(now, next)
        next = at + interval
        const wait = at - now
        return wait > 0 ? new Promise(r => setTimeout(r, wait)) : Promise.resolve()
    }
}

// Фаза 1: подготовить (сгенерировать + один раз загрузить в VK) каждое УНИКАЛЬНОЕ
// расписание. Идёт через общую очередь, чтобы не запускать Puppeteer параллельно
// с обычными запросами пользователей.
async function prepareUnique(uniqueItems, bot) {
    const prepared = new Map() // key -> { attachments, caption } | null
    for (const [key, { category, value }] of uniqueItems) {
        if (storage.get("telegram_stop")) {
            console.log("[delivery] идёт генерация расписания — подготовка прервана")
            return { prepared, aborted: true }
        }
        await new Promise((resolve) => {
            tasker.add({
                func: async () => {
                    try {
                        const images = await getimages(value, "/" + category)
                        if (images && images.length) {
                            const attachments = await bot.prepareAttachments(images)
                            prepared.set(key, { attachments, caption: `Расписание для ${value}` })
                        } else {
                            prepared.set(key, null)
                            console.log(`[delivery] нет картинок для ${key}`)
                        }
                    } catch (e) {
                        prepared.set(key, null)
                        console.error(`[delivery] ошибка подготовки ${key}:`, e?.message || e)
                    } finally {
                        resolve()
                    }
                }
            })
        })
    }
    return { prepared, aborted: false }
}

module.exports.start = async () => {
    if (running) {
        console.log("[delivery] рассылка уже идёт — повторный запуск пропущен")
        return
    }
    const mode = settings.get("deliverymode", "all")
    if (mode === "off") {
        console.log("[delivery] режим доставки: off — рассылка отключена")
        return
    }

    running = true
    const startedAt = Date.now()
    try {
        let users = await getAllSubscribers()
        if (mode === "admins") {
            users = users.filter(u => vk.admins && vk.admins[u.userid])
        }
        console.log(`[delivery] старт (режим=${mode}), подписчиков: ${users.length}`)
        if (users.length === 0) return

        // Разбираем подписки и собираем множество уникальных расписаний
        const parsedUsers = []
        const uniqueItems = new Map() // "category/value" -> { category, value }
        for (const u of users) {
            let subs
            try {
                subs = JSON.parse(u.subscribes)
            } catch {
                console.warn(`[delivery] битые subscribes у ${u.userid}, пропуск`)
                continue
            }
            const items = []
            for (const category in subs) {
                const value = subs[category]
                if (!value) continue
                const key = category + "/" + value
                items.push({ key })
                if (!uniqueItems.has(key)) uniqueItems.set(key, { category, value })
            }
            if (items.length) parsedUsers.push({ userid: u.userid, items })
        }
        console.log(`[delivery] уникальных расписаний к генерации: ${uniqueItems.size}`)

        const bot = storage.get("bot")
        if (!bot) {
            console.error("[delivery] бот не инициализирован — рассылка отменена")
            return
        }

        // Фаза 1 — подготовка картинок (последовательно, защищает Puppeteer)
        const { prepared, aborted } = await prepareUnique(uniqueItems, bot)
        if (aborted) return

        // Фаза 2 — рассылка (параллельно, с ограничением скорости; без Puppeteer)
        const summaryText = `Изменения в расписании\n\n${storage.get("vk_comment") || ""}\n\nОбновлено: ${storage.get("vk_lastupdate") || "—"}`
        const slot = makeRateLimiter(BROADCAST_RATE)
        let sent = 0, failed = 0

        await mapLimit(parsedUsers, BROADCAST_CONCURRENCY, async (pu) => {
            try {
                // Текст "изменения в расписании" вкладываем в подпись первого
                // сообщения-расписания — так одному подписчику уходит 1 сообщение,
                // а не 2 (важно при 1500 адресатах и лимите скорости).
                let first = true
                for (const it of pu.items) {
                    const prep = prepared.get(it.key)
                    if (!prep || !prep.attachments || !prep.attachments.length) continue
                    const caption = first ? `${summaryText}\n\n${prep.caption}` : prep.caption
                    await slot()
                    await withRetry(() => bot.sendAttachments(pu.userid, prep.attachments, caption))
                    first = false
                }
                if (first) {
                    // Ни одной картинки не нашлось — шлём только текст изменений.
                    await slot()
                    await withRetry(() => bot.sendMessage(pu.userid, summaryText))
                }
                sent++
            } catch (e) {
                failed++
                // 901/902/936 — пользователь запретил сообщения от группы, это норма
                const code = e?.code
                if (code !== 901 && code !== 902 && code !== 936) {
                    console.error(`[delivery] не доставлено ${pu.userid}:`, e?.message || e)
                }
            }
            const done = sent + failed
            if (done % 100 === 0 || done === parsedUsers.length) {
                console.log(`[delivery] прогресс: ${done}/${parsedUsers.length} (ошибок: ${failed})`)
            }
        })

        const secs = ((Date.now() - startedAt) / 1000).toFixed(1)
        console.log(`[delivery] завершено: доставлено ${sent}, не доставлено ${failed}, за ${secs}с`)
    } catch (e) {
        console.error("[delivery] фатальная ошибка рассылки:", e?.message || e)
    } finally {
        running = false
    }
}

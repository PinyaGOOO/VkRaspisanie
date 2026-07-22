const loader = require("./downloader/downloader.js")
const initalizepaths = require("./helpers/initalizefiles.js")
const exceleditor = require("./modules/exceleditor.js")
const tempcleaner = require("./helpers/tempcleaner.js")
const delivery = require("./vk/modules/updatedelivery.js")
const db = require("./database/db.js")

loader.run().then(async () => {
    await exceleditor.run()
    const vkbot = require("./vk/main.js")
    const tv = require("./tv/express.js")
}).catch((err) => {
    console.error("[index] Ошибка при запуске — не удалось загрузить расписание:", err?.message || err)
    // Всё равно запускаем бота, просто без свежего расписания
    const vkbot = require("./vk/main.js")
    const tv = require("./tv/express.js")
})

loader.idle(async () => {
    loader.run().then(async () => {
        await tempcleaner.run()
        await exceleditor.run()
        await delivery.start()
    }).catch((err) => {
        console.error("[index] Ошибка при обновлении расписания:", err?.message || err)
    })
})

process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', new Date().toISOString(), err.message)
})

process.on('unhandledRejection', (err) => {
    console.error('[unhandledRejection]', new Date().toISOString(), err?.message || err)
})

// Быстрый выход по сигналу от systemd (иначе puppeteer держит браузер и SIGTERM
// «зависает» — systemd ждёт TimeoutStopSec и добивает SIGKILL, отсюда долгий restart).
let shuttingDown = false
const shutdown = (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[shutdown] получен ${signal}, завершаемся`)
    // даём немного времени флашнуть логи и выходим
    setTimeout(() => process.exit(0), 200)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

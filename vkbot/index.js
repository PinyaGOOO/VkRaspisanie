const loader = require("./downloader/downloader.js")
const initalizepaths = require("./helpers/initalizefiles.js")
const exceleditor = require("./modules/exceleditor.js")
const tempcleaner = require("./helpers/tempcleaner.js")
const delivery = require("./vk/modules/updatedelivery.js")
const db = require("./database/db.js")

const buildSchedule = async (scheduleData) => {
    await loader.run(scheduleData)
    await tempcleaner.run()
    await exceleditor.run()
}

const processUpdate = async (scheduleData) => {
    console.log(`[index] Обнаружено новое расписание: ${scheduleData.documentid || scheduleData.postid}`)
    await buildSchedule(scheduleData)

    const result = await delivery.start()
    if (!result?.completed) {
        throw new Error(`рассылка не завершена (${result?.reason || "неизвестная причина"})`)
    }
    if (result.total > 0 && result.sent === 0 && result.failed > 0) {
        throw new Error("расписание не доставлено ни одному подписчику")
    }
}

const startRuntime = () => {
    require("./vk/main.js")
    require("./tv/express.js")
    loader.idle(processUpdate)
}

const boot = async () => {
    try {
        // На старте подготавливаем актуальные данные для запросов пользователей.
        // Авторассылку запускает polling ниже, если сохранённый marker устарел.
        await buildSchedule()
    } catch (err) {
        console.error("[index] Ошибка при запуске — не удалось подготовить расписание:", err?.message || err)
    } finally {
        // Polling начинается только после стартовой генерации, поэтому два процесса
        // больше не удаляют files/temp друг у друга.
        startRuntime()
    }
}

boot()

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

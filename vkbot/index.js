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

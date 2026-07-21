const tempcleaner = require("../../helpers/tempcleaner.js")
const { vk } = require("../../cfg.json")
const editor = require("../../modules/exceleditor.js")
const loader = require("../../downloader/downloader.js")
const settings = require("../../settings.js")
const storage = require("../../helpers/globaldata.js")

module.exports = {
    func: async (ctx) => {
        const userid = ctx.userId
        if (!vk.admins || !vk.admins[userid]) return
        if (storage.get("telegram_stop")) {
            await ctx.reply("Admin: Уже выполняется генерация, подождите.")
            return
        }
        await tempcleaner.run()
        await ctx.reply("Admin: Удаляем КЭШ")
        settings.set("scheduleurl", "")
        await loader.run()
        await ctx.reply("Admin: Скачиваем новое расписание")
        await editor.run()
        await ctx.reply("Admin: Таблица сгенерированна")
    }
}

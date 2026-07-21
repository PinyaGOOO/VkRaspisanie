const { vk } = require("../../cfg.json")
const { buildKeyboard } = require("../helpers/buttonFormater.js")
const settings = require("../../settings.js")

module.exports = {
    func: async (ctx) => {
        const userid = ctx.userId
        if (!vk.admins || !vk.admins[userid]) return

        const mode = settings.get("deliverymode", "all")

        const rows = [
            [{ action: { type: "text", label: "🗑 Очистить Изображения/Таблицы", payload: JSON.stringify({ cmd: "func", arg: "tempclean" }) }, color: "negative" }],
            [{ action: { type: "text", label: "🔑 Удалить идентификатор расписания", payload: JSON.stringify({ cmd: "func", arg: "removehash" }) }, color: "negative" }],
            [{ action: { type: "text", label: "📬 Авторассылка: " + mode, payload: JSON.stringify({ cmd: "func", arg: "deliverymode" }) }, color: "secondary" }],
        ]

        if (mode !== "off") {
            rows.push([{ action: { type: "text", label: "🚀 Запустить Авторассылку", payload: JSON.stringify({ cmd: "func", arg: "rundelivery" }) }, color: "primary" }])
        }

        rows.push([{ action: { type: "text", label: "🧹 Очистить тасклист", payload: JSON.stringify({ cmd: "func", arg: "cleantasks" }) }, color: "secondary" }])
        rows.push([{ action: { type: "text", label: "< Назад", payload: JSON.stringify({ cmd: "redirect", arg: "start" }) }, color: "secondary" }])

        await ctx.reply(
            "Удаление идентификатора расписания скачает его заново и очистит изображения/таблицы.\nОчистка тасклиста полностью очистит очередь задач.",
            null,
            buildKeyboard(rows)
        )
    },
}

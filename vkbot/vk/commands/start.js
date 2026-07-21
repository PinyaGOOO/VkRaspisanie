const storage = require("../../helpers/globaldata.js")
const { buildKeyboard } = require("../helpers/buttonFormater.js")
const { vk } = require("../../cfg.json")

module.exports = {
    desc: "Начать работу с ботом",
    callback: async (ctx) => {
        const userid = ctx.userId
        const isAdmin = vk.admins && vk.admins[userid]

        const rows = [
            [
                { action: { type: "text", label: `${vk.emoji.groups} Группы`, payload: JSON.stringify({ cmd: "redirect", arg: "groups" }) }, color: "primary" },
                { action: { type: "text", label: `${vk.emoji.people} Преподаватели`, payload: JSON.stringify({ cmd: "redirect", arg: "peoples" }) }, color: "primary" },
            ],
            [
                { action: { type: "text", label: `📅 График консультаций`, payload: JSON.stringify({ cmd: "redirect", arg: "consultations" }) }, color: "primary" },
            ],
            [
                { action: { type: "text", label: `${vk.emoji.getsubs} Мои подписки`, payload: JSON.stringify({ cmd: "func", arg: "getsubscribes" }) }, color: "secondary" },
                { action: { type: "text", label: `${vk.emoji.subs} Подписки`, payload: JSON.stringify({ cmd: "redirect", arg: "automatization" }) }, color: "secondary" },
            ],
        ]

        if (isAdmin) {
            rows.push([{ action: { type: "text", label: "⚠️ Admin", payload: JSON.stringify({ cmd: "func", arg: "adminmenu" }) }, color: "negative" }])
        }

        const text = `Добро пожаловать в генератор расписания.\n\n${storage.get("vk_comment") || ""}\n\nОбновлено:\n${storage.get("vk_lastupdate") || "—"}\nСсылка на расписание: ${storage.get("vk_url") || "—"}`

        await ctx.reply(text, null, buildKeyboard(rows))
    }
}

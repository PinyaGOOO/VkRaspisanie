const storage = require("../../helpers/globaldata.js")
const { generatePagedButtons, buildKeyboard } = require("../helpers/buttonFormater.js")

module.exports = {
    desc: "Список преподавателей",
    callback: async (ctx, page = 0) => {
        const rows = generatePagedButtons("peoples", storage.get("people"), 2, page, "start")
        rows.push([
            { action: { type: "text", label: "🚪 Кабинеты", payload: JSON.stringify({ cmd: "redirect", arg: "rooms" }) }, color: "secondary" },
            { action: { type: "text", label: "< Назад", payload: JSON.stringify({ cmd: "redirect", arg: "start" }) }, color: "secondary" },
        ])
        await ctx.reply("Выберите преподавателя:", null, buildKeyboard(rows))
    }
}

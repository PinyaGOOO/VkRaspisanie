const storage = require("../../helpers/globaldata.js")
const { generatePagedButtons, buildKeyboard } = require("../helpers/buttonFormater.js")

module.exports = {
    desc: "Список групп",
    callback: async (ctx, page = 0) => {
        const rows = generatePagedButtons("groups", storage.get("groups"), 3, page, "start")
        rows.push([{
            action: { type: "text", label: "< Назад", payload: JSON.stringify({ cmd: "redirect", arg: "start" }) },
            color: "secondary"
        }])
        await ctx.reply("Выберите группу:", null, buildKeyboard(rows))
    }
}

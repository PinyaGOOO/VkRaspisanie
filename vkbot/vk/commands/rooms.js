const storage = require("../../helpers/globaldata.js")
const { generatePagedButtons, buildKeyboard } = require("../helpers/buttonFormater.js")

module.exports = {
    desc: "Получить список Кабинетов",
    callback: async (ctx, page = 0) => {
        const rows = generatePagedButtons("rooms", storage.get("rooms"), 4, page, "peoples")
        rows.push([
            { action: { type: "text", label: "Свободные кабинеты", payload: JSON.stringify({ cmd: "redirect", arg: "room_empty" }) }, color: "secondary" },
            { action: { type: "text", label: "< Назад", payload: JSON.stringify({ cmd: "redirect", arg: "peoples" }) }, color: "secondary" },
        ])
        await ctx.reply("Выберите кабинет:", null, buildKeyboard(rows))
    }
}

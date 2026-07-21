const storage = require("../../helpers/globaldata.js")
const { generatePagedButtons, buildKeyboard } = require("../helpers/buttonFormater.js")
const db = require("../../database/db.js")

module.exports = {
    func: async (ctx, cmd, data) => {
        const userid = ctx.userId
        const category = data && data.category ? data.category : data
        const page = (data && data.page !== undefined) ? data.page : 0

        await db.createUser(userid)
        let subsRow = await db.getUserSubScribes(userid)
        let subs = JSON.parse(subsRow?.subscribes ?? '{}')

        const values = storage.get(category) || []
        const currSub = subs[category]

        // Помечаем активную подписку «✅», но в payload кнопки кладём чистое
        // значение (иначе подписка сохранилась бы как «✅ Имя» и не находилась).
        const markedValues = values.map(v => (currSub === v ? { label: "✅ " + v, value: v } : v))
        const rows = generatePagedButtons("setautomatization_" + category, markedValues, 3, page, "automatization")

        if (currSub) {
            rows.push([{ action: { type: "text", label: "🔕 Отменить подписку", payload: JSON.stringify({ cmd: "func", arg: "setautomatization", data: { type: "unsub", category } }) }, color: "negative" }])
        }
        rows.push([{ action: { type: "text", label: "< Назад", payload: JSON.stringify({ cmd: "redirect", arg: "automatization" }) }, color: "secondary" }])

        await ctx.reply("Выберите подписку:", null, buildKeyboard(rows))
    },
}

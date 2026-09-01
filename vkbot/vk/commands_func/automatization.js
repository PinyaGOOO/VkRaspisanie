const storage = require("../../helpers/globaldata.js")
const { generatePagedButtons, buildKeyboard } = require("../helpers/buttonFormater.js")
const db = require("../../database/db.js")
const {
    GROUP_SUBSCRIPTION_LIMIT,
    normalizeGroupSubscriptions,
} = require("../subscriptions.js")

module.exports = {
    func: async (ctx, cmd, data) => {
        const userid = ctx.userId
        const category = data && data.category ? data.category : data
        const page = (data && data.page !== undefined) ? data.page : 0

        await db.createUser(userid)
        let subsRow = await db.getUserSubScribes(userid)
        let subs = JSON.parse(subsRow?.subscribes ?? '{}')

        const values = storage.get(category) || []
        const currSubs = category === "groups"
            ? normalizeGroupSubscriptions(subs.groups)
            : (subs[category] ? [subs[category]] : [])

        // Помечаем активную подписку «✅», но в payload кнопки кладём чистое
        // значение (иначе подписка сохранилась бы как «✅ Имя» и не находилась).
        const markedValues = values.map(v => (currSubs.includes(v) ? { label: "✅ " + v, value: v } : v))
        const rows = generatePagedButtons("setautomatization_" + category, markedValues, 3, page, "automatization")

        if (currSubs.length) {
            const label = category === "groups" ? "🔕 Отменить все подписки" : "🔕 Отменить подписку"
            rows.push([{ action: { type: "text", label, payload: JSON.stringify({ cmd: "func", arg: "setautomatization", data: { type: "unsub", category } }) }, color: "negative" }])
        }
        rows.push([{ action: { type: "text", label: "< Назад", payload: JSON.stringify({ cmd: "redirect", arg: "automatization" }) }, color: "secondary" }])

        const prompt = category === "groups"
            ? `Выберите группы (${currSubs.length}/${GROUP_SUBSCRIPTION_LIMIT}). Повторное нажатие отменяет подписку:`
            : "Выберите подписку:"
        await ctx.reply(prompt, null, buildKeyboard(rows))
    },
}

const { buildKeyboard } = require("../helpers/buttonFormater.js")
const db = require("../../database/db.js")
const {
    GROUP_SUBSCRIPTION_LIMIT,
    toggleGroupSubscription,
} = require("../subscriptions.js")

module.exports = {
    func: async (ctx, cmd, data) => {
        const userid = ctx.userId
        await db.createUser(userid)
        let subsRow = await db.getUserSubScribes(userid)
        let subs = JSON.parse(subsRow?.subscribes ?? '{}')

        const backRow = [[{
            action: { type: "text", label: "< Назад", payload: JSON.stringify({ cmd: "redirect", arg: "automatization" }) },
            color: "secondary"
        }]]

        if (data.type === "unsub") {
            delete subs[data.category]
            await db.setUserSubScribe(userid, JSON.stringify(subs))
            await ctx.reply("Подписка отменена.", null, buildKeyboard(backRow))
            return
        }

        // type === "set"
        if (data.category === "groups") {
            const result = toggleGroupSubscription(subs.groups, data.value)
            if (result.status === "limit") {
                await ctx.reply(
                    `Можно подписаться максимум на ${GROUP_SUBSCRIPTION_LIMIT} группы. Сначала отмените одну из текущих подписок.`,
                    null,
                    buildKeyboard(backRow)
                )
                return
            }

            if (result.groups.length) subs.groups = result.groups
            else delete subs.groups
            await db.setUserSubScribe(userid, JSON.stringify(subs))
            const message = result.status === "added"
                ? `Вы подписались на ${data.value} (${result.groups.length}/${GROUP_SUBSCRIPTION_LIMIT})`
                : `Подписка на ${data.value} отменена.`
            await ctx.reply(message, null, buildKeyboard(backRow))
            return
        }

        subs[data.category] = data.value
        await db.setUserSubScribe(userid, JSON.stringify(subs))
        await ctx.reply(`Вы подписались на ${data.value}`, null, buildKeyboard(backRow))
    },
}

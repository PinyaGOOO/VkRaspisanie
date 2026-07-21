const { buildKeyboard } = require("../helpers/buttonFormater.js")
const db = require("../../database/db.js")

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
        subs[data.category] = data.value
        await db.setUserSubScribe(userid, JSON.stringify(subs))
        await ctx.reply(`Вы подписались на ${data.value}`, null, buildKeyboard(backRow))
    },
}

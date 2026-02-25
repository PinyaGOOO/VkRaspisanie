const { buildKeyboard } = require("../vkapi.js")
const db = require("../../database/db.js")

module.exports = {
    func: async (ctx, cmd, arg, data) => {
        const userid = ctx.userId
        let subs = await db.getUserSubScribes(userid)
        subs = JSON.parse(subs.subscribes)

        const buttons = [[{ text: 'Назад', callback_data: 'redirect:automatization' }]]

        if (arg === "unsub") {
            delete subs[data]
            await db.setUserSubScribe(userid, JSON.stringify(subs))
            await ctx.reply("Подписка отменена", buildKeyboard(buttons))
            return
        }

        subs[arg] = data
        await db.setUserSubScribe(userid, JSON.stringify(subs))
        await ctx.reply("Вы подписались на " + data, buildKeyboard(buttons))
    },
}

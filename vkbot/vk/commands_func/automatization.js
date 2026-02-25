const storage = require("../../helpers/globaldata.js")
const { buildKeyboard } = require("../vkapi.js")
const db = require("../../database/db.js")

function generateInlineKeyboardButtons(dataway, values, colums = 4, currsub) {
    const result = []
    const rows = Math.ceil(values.length / colums)
    for (let i = 0; i < rows; i++) {
        const rowButtons = []
        for (let j = 0; j < colums; j++) {
            const index = i * colums + j
            if (index < values.length) {
                rowButtons.push({
                    text: (currsub === values[index] ? "⭐ " : "") + values[index],
                    callback_data: dataway + ":" + values[index]
                })
            }
        }
        result.push(rowButtons)
    }
    return result
}

module.exports = {
    func: async (ctx, cmd, arg) => {
        const userid = ctx.userId
        let subs = await db.getUserSubScribes(userid)
        subs = JSON.parse(subs.subscribes)

        const data = storage.get(arg)
        const buttons = generateInlineKeyboardButtons("func:setautomatization:" + arg, data, 3, subs[arg])

        if (subs[arg]) {
            buttons.push([{ text: '⛔ Отменить подписку', callback_data: 'func:setautomatization:unsub:' + arg }])
        }
        buttons.push([{ text: 'Назад', callback_data: 'redirect:automatization' }])

        await ctx.reply("Выберите подписку", buildKeyboard(buttons))
    },
}

const tasker = require("../requestqueue.js")
const db = require("../../database/db.js")
const getimages = require("../../modules/getimagebyname.js")
const { vk } = require("../../cfg.json")
const startcmd = require("../commands/start.js")
const { buildKeyboard } = require("../vkapi.js")

module.exports = {
    func: async (ctx) => {
        const userID = ctx.userId
        if (tasker.userHasBan(userID)) return

        const subs = await db.getUserSubScribes(userID)
        if (!subs || subs.subscribes === "{}") {
            const buttons = [[{ text: 'Ок', callback_data: 'redirect:start' }]]
            await ctx.reply(`У вас нет активных подписок! Перейдите в раздел ${vk.emoji.subs} Подписки и настройте!`, buildKeyboard(buttons))
            return
        }

        const subsObj = JSON.parse(subs.subscribes)
        let incrementer = 0

        for (const key in subsObj) {
            const item_name = subsObj[key]
            tasker.add({
                userid: userID,
                addbantime: 5,
                func: async () => {
                    incrementer++
                    const images = await getimages(item_name, "/" + key)
                    await ctx.sendPhotos(images, `Расписание для ${item_name}`)
                    if (incrementer >= Object.keys(subsObj).length) {
                        startcmd.callback(ctx)
                    }
                }
            })
        }
    }
}

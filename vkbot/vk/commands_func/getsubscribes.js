const tasker = require("../requestqueue.js")
const db = require("../../database/db.js")
const getimages = require("../../modules/getimagebyname.js")
const { vk } = require("../../cfg.json")
const startcmd = require("../commands/start.js")

module.exports = {
    func: async (ctx) => {
        const userID = ctx.userId
        if (tasker.userHasBan(userID)) return
        const subs = await db.getUserSubScribes(userID)
        if (!subs || subs.subscribes === "{}") {
            await ctx.reply(`У вас нет активных подписок! Перейдите в раздел ${vk.emoji.subs} Подписки и настройте!`)
            return
        }
        const subsObj = JSON.parse(subs.subscribes)
        let incrementer = 0
        const total = Object.keys(subsObj).length
        for (const key in subsObj) {
            const item_name = subsObj[key]
            tasker.add({
                userid: userID,
                addbantime: 5,
                func: async () => {
                    incrementer++
                    try {
                        const images = await getimages(item_name, "/" + key)
                        if (!images || images.length === 0) {
                            await ctx.reply(`Нет данных для ${item_name}`)
                        } else {
                            await ctx.sendPhotos(images, `Расписание для ${item_name}`)
                        }
                    } catch(e) {
                        console.error(`[getsubscribes] ошибка для ${item_name}:`, e.message)
                        await ctx.reply(`Ошибка при получении расписания для ${item_name}`)
                    }
                    if (incrementer >= total) {
                        startcmd.callback(ctx)
                    }
                }
            })
        }
    }
}

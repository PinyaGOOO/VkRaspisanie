const { vk } = require("../../cfg.json")
const { buildKeyboard } = require("../vkapi.js")
const db = require("../../database/db.js")

module.exports = {
    hide: true,
    desc: "",
    callback: async (ctx) => {
        const userid = ctx.userId
        const user = await db.createUser(userid)
        let subscribes = {}
        if (user.subscribes && user.subscribes !== "{}") {
            subscribes = JSON.parse(user.subscribes)
        }

        const buttons = [
            [{ text: `${vk.emoji.groups} Группы${subscribes.groups ? " | " + subscribes.groups : ""}`, callback_data: 'func:automatization:groups' }],
            [{ text: `${vk.emoji.people} Преподаватели${subscribes.people ? " | " + subscribes.people : ""}`, callback_data: 'func:automatization:people' }],
            [{ text: 'Назад', callback_data: 'redirect:start' }],
        ]

        await ctx.reply("Подписка позволит получать расписание при его обновлении/изменении.\n\n⚠️Вы можете подписаться только на 1 группу и на 1 преподавателя.", buildKeyboard(buttons))
    },
}

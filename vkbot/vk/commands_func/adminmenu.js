const { vk } = require("../../cfg.json")
const { buildKeyboard } = require("../vkapi.js")
const settings = require("../../settings.js")

module.exports = {
    func: async (ctx) => {
        const userid = ctx.userId
        if (!vk.admins || !vk.admins[userid]) return

        const buttons = []
        buttons.push([{ text: 'Очистить Изображения/Таблицы', callback_data: 'func:tempclean' }])
        buttons.push([{ text: 'Удалить идентификатор расписания', callback_data: 'func:removehash' }])

        const mode = settings.get("deliverymode", "all")
        buttons.push([{ text: 'Авторассылка: ' + mode, callback_data: 'func:deliverymode' }])

        if (mode !== "off") {
            buttons.push([{ text: 'Запустить Авторассылку', callback_data: 'func:rundelivery' }])
        }

        buttons.push([{ text: 'Очистить тасклист', callback_data: 'func:cleantasks' }])
        buttons.push([{ text: 'Назад', callback_data: 'redirect:start' }])

        await ctx.reply("Удаление идентефикатора расписания скачает его заного и очистит изображения/таблицы (не запустит авторассылки)\nОтчиска тасклиста полностью очистит тасклист", buildKeyboard(buttons))
    },
}

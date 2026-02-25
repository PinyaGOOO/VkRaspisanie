const storage = require("../../helpers/globaldata.js")
const { buildKeyboard } = require("../vkapi.js")
const { vk } = require("../../cfg.json")

module.exports = {
    desc: "Начать работу с ботом",
    callback: async (ctx) => {
        const userid = ctx.userId
        const isAdmin = vk.admins && vk.admins[userid]

        const buttons = [
            [
                { text: `${vk.emoji.groups} Группы`, callback_data: 'redirect:groups' },
                { text: `${vk.emoji.people} Преподаватели`, callback_data: 'redirect:peoples' },
            ],
            [
                { text: `${vk.emoji.getsubs} Запросить мои подписки`, callback_data: 'func:getsubscribes' },
                { text: `${vk.emoji.subs} Подписки`, callback_data: 'redirect:automatization' },
            ],
        ]

        const endrow = [
            { text: `${vk.emoji.close} Закрыть`, callback_data: 'func:closemenu' },
        ]
        if (isAdmin) {
            endrow.push({ text: '⚠️ Admin', callback_data: 'func:adminmenu' })
        }
        buttons.push(endrow)

        const text = `Добро пожаловать в генератор расписания.\n\n${storage.get("vk_comment") || ""}\n\nОбновлено:\n${storage.get("vk_lastupdate") || "—"}\nСсылка на расписание: ${storage.get("vk_url") || "—"}`

        await ctx.reply(text, buildKeyboard(buttons))
    }
}

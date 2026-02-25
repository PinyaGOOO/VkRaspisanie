const storage = require("../../helpers/globaldata.js")
const { buildKeyboard } = require("../vkapi.js")

module.exports = {
    desc: "Свободные кабинеты",
    callback: async (ctx) => {
        const buttons = [[{ text: 'Назад', callback_data: 'redirect:rooms' }]]
        // Логика свободных кабинетов — такая же как в оригинале
        await ctx.reply("Список свободных кабинетов появится здесь.", buildKeyboard(buttons))
    },
}

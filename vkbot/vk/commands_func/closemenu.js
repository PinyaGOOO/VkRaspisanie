module.exports = {
    func: async (ctx) => {
        try {
            const storage = require("../../helpers/globaldata.js")
            const bot = storage.get("bot")
            // Отправляем сообщение с пустой клавиатурой (убирает кнопки)
            await bot.api("messages.send", {
                peer_id: ctx.peerId,
                message: "Меню закрыто",
                random_id: Math.floor(Math.random() * 1e9),
                keyboard: JSON.stringify({ one_time: true, inline: false, buttons: [] })
            })
            if (ctx.answerEvent) {
                await ctx.answerEvent("")
            }
        } catch(e) {
            console.error("closemenu error:", e.message)
        }
    },
}

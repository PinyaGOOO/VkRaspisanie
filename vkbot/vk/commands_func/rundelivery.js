const { vk } = require("../../cfg.json")
const delivery = require("../modules/updatedelivery.js")

module.exports = {
    func: async (ctx) => {
        const userid = ctx.userId
        if (!vk.admins || !vk.admins[userid]) return
        try {
            const result = await delivery.start()
            if (!result?.completed) {
                await ctx.reply(`Admin: рассылка не запущена (${result?.reason || "неизвестная причина"})`)
            }
        } catch (error) {
            console.error("[admin] Ошибка ручной рассылки:", error?.message || error)
            await ctx.reply("Admin: рассылка завершилась с ошибкой, подробности записаны в журнал.")
        }
    }
}

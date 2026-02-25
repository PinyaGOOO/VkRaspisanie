const { vk } = require("../../cfg.json")
const tasker = require("../requestqueue.js")

module.exports = {
    func: async (ctx) => {
        const userid = ctx.userId
        if (!vk.admins || !vk.admins[userid]) return
        tasker.queue = []
        tasker.add({
            func: async () => {
                await ctx.reply("Admin: Задача на отчистку выполнена.")
            }
        })
        await ctx.reply("Admin: Отчищаем...")
    }
}

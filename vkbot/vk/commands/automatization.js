const { vk } = require("../../cfg.json")
const { buildKeyboard } = require("../helpers/buttonFormater.js")
const db = require("../../database/db.js")
const { GROUP_SUBSCRIPTION_LIMIT, normalizeGroupSubscriptions } = require("../subscriptions.js")

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

        const groups = normalizeGroupSubscriptions(subscribes.groups)
        const rows = [
            [{ action: { type: "text", label: `${vk.emoji.groups} Группы | ${groups.length}/${GROUP_SUBSCRIPTION_LIMIT}`, payload: JSON.stringify({ cmd: "func", arg: "automatization", data: { category: "groups" } }) }, color: "secondary" }],
            [{ action: { type: "text", label: `${vk.emoji.people} Преподаватели${subscribes.people ? " | " + subscribes.people : ""}`, payload: JSON.stringify({ cmd: "func", arg: "automatization", data: { category: "people" } }) }, color: "secondary" }],
            [{ action: { type: "text", label: "< Назад", payload: JSON.stringify({ cmd: "redirect", arg: "start" }) }, color: "secondary" }],
        ]

        await ctx.reply("Подписка позволит получать расписание при его обновлении/изменении.\n\n⚠️ Бот отправит расписание только при изменении.", null, buildKeyboard(rows))
    }
}

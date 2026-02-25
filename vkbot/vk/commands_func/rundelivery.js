const { vk } = require("../../cfg.json")
const delivery = require("../modules/updatedelivery.js")

module.exports = {
    func: async (ctx) => {
        const userid = ctx.userId
        if (!vk.admins || !vk.admins[userid]) return
        delivery.start()
    }
}

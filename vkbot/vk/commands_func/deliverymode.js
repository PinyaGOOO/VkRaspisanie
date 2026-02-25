const { vk } = require("../../cfg.json")
const settings = require("../../settings.js")
const adminmenu = require("./adminmenu.js")

const modes = {
    1: "all", 2: "admins", 3: "off",
    "all": 1, "admins": 2, "off": 3,
}

module.exports = {
    func: async (ctx) => {
        const userid = ctx.userId
        if (!vk.admins || !vk.admins[userid]) return
        let cur_mode = settings.get("deliverymode", "all")
        let index = modes[cur_mode] + 1
        if (!modes[index]) index = 1
        settings.set("deliverymode", modes[index])
        adminmenu.func(ctx)
    }
}

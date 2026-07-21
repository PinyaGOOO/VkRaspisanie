const fs = require('fs')
const { buildKeyboard } = require("../helpers/buttonFormater.js")

const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
const tempdir = "./files/temp/emptyrooms"

module.exports = {
    desc: "Свободные кабинеты",
    callback: async (ctx) => {
        const rows = DAYS.map(day => ([{
            action: { type: "text", label: day, payload: JSON.stringify({ cmd: "emptyrooms", arg: day }) },
            color: "primary"
        }]))
        rows.push([{
            action: { type: "text", label: "< Назад", payload: JSON.stringify({ cmd: "redirect", arg: "rooms" }) },
            color: "secondary"
        }])
        await ctx.reply("Выберите день:", null, buildKeyboard(rows))
    }
}

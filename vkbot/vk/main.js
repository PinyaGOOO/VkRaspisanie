const storage = require("../helpers/globaldata.js")
      storage.init("bot")
const getimages = require("../modules/getimagebyname.js")
const tasker = require("./requestqueue.js")
const { VkBot } = require("./vkapi.js")
const { vk } = require("../cfg.json")
const fs = require('fs')

const bot = new VkBot(vk.token, vk.groupId)
storage.set("bot", bot)

const commandscache = {}
const commandfunccache = {}

function registerCommands() {
    const commandFiles = fs.readdirSync(__dirname + '/commands').filter(f => f.endsWith('.js'))
    for (const file of commandFiles) {
        commandscache[file.split('.')[0]] = require(`./commands/${file}`)
    }
    const commandFuncFiles = fs.readdirSync(__dirname + '/commands_func').filter(f => f.endsWith('.js'))
    for (const file of commandFuncFiles) {
        commandfunccache[file.split('.')[0]] = require(`./commands_func/${file}`)
    }
}

async function handleMessage(ctx) {
    const textLower = (ctx.text || "").trim().toLowerCase()
    const payload = ctx.payload

    if (payload) {
        console.log("payload:", JSON.stringify(payload))
        // Кнопка Start отправляет {command: "start"}
        if (payload.command === "start") {
            if (commandscache["start"]) await commandscache["start"].callback(ctx)
            return
        }
        await handlePayload(ctx, ctx.userId, payload)
        return
    }

    if (textLower === "начать" || textLower === "/start" || textLower === "start") {
        if (commandscache["start"]) await commandscache["start"].callback(ctx)
        return
    }

    if (commandscache["start"]) await commandscache["start"].callback(ctx)
}

async function handlePayload(ctx, userId, payload) {
    const { cmd, arg, data } = payload

    if (storage.get("telegram_stop")) {
        await ctx.reply("Генерируем данные! Попробуйте снова через 30 секунд.")
        return
    }

    if (cmd === "redirect") {
        if (!commandscache[arg]) return
        await commandscache[arg].callback(ctx)
        return
    }

    if (cmd === "page") {
        const pageNum = (data && data.page !== undefined) ? data.page : 0

        // Пагинация обычных команд (groups, peoples, rooms)
        if (commandscache[arg]) {
            await commandscache[arg].callback(ctx, pageNum)
            return
        }

        // Пагинация setautomatization_*
        if (arg.startsWith("setautomatization_")) {
            const category = arg.replace("setautomatization_", "")
            if (commandfunccache["automatization"]) {
                await commandfunccache["automatization"].func(ctx, "automatization", { category, page: pageNum })
            }
            return
        }

        return
    }

    if (cmd === "noop") return

    if (cmd === "emptyrooms") {
        const { buildKeyboard } = require("./helpers/buttonFormater.js")
        const imagePath = `./files/temp/emptyrooms/${arg}.jpeg`
        const backRow = [[{ action: { type: "text", label: "< Назад", payload: JSON.stringify({ cmd: "redirect", arg: "room_empty" }) }, color: "secondary" }]]
        if (!fs.existsSync(imagePath)) {
            await ctx.reply(`Нет данных для: ${arg}`, null, buildKeyboard(backRow))
            return
        }
        await ctx.sendPhotos([imagePath], `Свободные кабинеты — ${arg}`)
        await ctx.reply("Выберите действие:", null, buildKeyboard(backRow))
        return
    }


    if (cmd === "groups") {
        console.log(`[groups] user:${userId} group:${arg}`)
        if (tasker.userHasBan(userId)) return
        const msg = await ctx.reply(`Обрабатываем запрос... (Расписание ${arg})`)
        tasker.add({ ctx, userid: userId, addbantime: 1, func: async () => {
            try {
                const images = await getimages(arg, "/groups")
                if (!images || images.length === 0) {
                    await ctx.reply(`Нет данных для ${arg}`)
                    return
                }
                await ctx.sendPhotos(images, `Расписание для ${arg}`)
                await ctx.deleteMessage(msg)
            } catch(e) {
                console.error(`[error] groups ${arg}:`, e.message)
                await ctx.reply("Произошла ошибка, попробуйте позже.")
            }
        }})
        return
    }


    if (cmd === "peoples") {
        console.log(`[peoples] user:${userId} teacher:${arg}`)
        if (tasker.userHasBan(userId)) return
        const msg = await ctx.reply(`Обрабатываем запрос... (Расписание ${arg})`)
        tasker.add({ ctx, userid: userId, addbantime: 1, func: async () => {
            try {
                const images = await getimages(arg, "/people")
                if (!images || images.length === 0) {
                    await ctx.reply(`Нет данных для ${arg}`)
                    return
                }
                await ctx.sendPhotos(images, `Расписание для ${arg}`)
                await ctx.deleteMessage(msg)
            } catch(e) {
                console.error(`[error] peoples ${arg}:`, e.message)
                await ctx.reply("Произошла ошибка, попробуйте позже.")
            }
        }})
        return
    }


    if (cmd === "rooms") {
        console.log(`[rooms] user:${userId} room:${arg}`)
        if (tasker.userHasBan(userId)) return
        const msg = await ctx.reply(`Обрабатываем запрос... (Расписание кабинета ${arg})`)
        tasker.add({ ctx, userid: userId, addbantime: 1, func: async () => {
            try {
                const images = await getimages(arg, "/rooms")
                if (!images || images.length === 0) {
                    await ctx.reply(`Нет данных для ${arg}`)
                    return
                }
                await ctx.sendPhotos(images, `Расписание для ${arg}`)
                await ctx.deleteMessage(msg)
            } catch(e) {
                console.error(`[error] rooms ${arg}:`, e.message)
                await ctx.reply("Произошла ошибка, попробуйте позже.")
            }
        }})
        return
    }

    if (cmd && cmd.startsWith("setautomatization_")) {
        const category = cmd.replace("setautomatization_", "")
        if (commandfunccache["setautomatization"]) {
            await commandfunccache["setautomatization"].func(ctx, "setautomatization", { type: "set", category, value: arg })
        }
        return
    }

    if (cmd === "func") {
        if (!commandfunccache[arg]) return
        await commandfunccache[arg].func(ctx, arg, data)
        return
    }
}

async function handleCallback(ctx) {
    if (storage.get("telegram_stop")) {
        await ctx.reply("Генерируем данные! Попробуйте снова через 30 секунд.")
        return
    }
    const data = ctx.callbackData
    const userID = ctx.userId
    console.log("callback:", userID, data)

    if (data.startsWith('func:')) {
        const args = data.split(':')
        if (!commandfunccache[args[1]]) return
        commandfunccache[args[1]].func(ctx, ...args.slice(1))
    }

    if (data.startsWith('redirect:')) {
        const command = data.split(':')[1]
        if (!commandscache[command]) return
        commandscache[command].callback(ctx)
    }
}

function startBot() {
    registerCommands()
    bot.on('message', handleMessage)
    bot.on('callback', handleCallback)
    bot.catch((err) => console.error(err))
    bot.start()
    console.log("VK Bot started!")
}

startBot()
